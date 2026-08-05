import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'
import './App.css'

// 학년 선택 목록
const GRADE_OPTIONS = [
  '초1', '초2', '초3', '초4', '초5', '초6',
  '중1', '중2', '중3',
  '고1', '고2', '고3'
]

// 학년 정렬 우선순위
const GRADE_ORDER = {
  '초1': 1, '초2': 2, '초3': 3, '초4': 4, '초5': 5, '초6': 6,
  '중1': 7, '중2': 8, '중3': 9,
  '고1': 10, '고2': 11, '고3': 12
}

// 선택 가능한 수업 시간 옵션 (분 단위)
const DURATION_OPTIONS = [
  { label: '30분', value: 30 },
  { label: '45분', value: 45 },
  { label: '1시간 (60분)', value: 60 },
  { label: '1.5시간 (90분)', value: 90 },
  { label: '2시간 (120분)', value: 120 },
  { label: '2.5시간 (150분)', value: 150 },
  { label: '3시간 (180분)', value: 180 },
]

function App() {
  const [students, setStudents] = useState([])
  const [newName, setNewName] = useState('')
  const [schoolLevel, setSchoolLevel] = useState('초1')
  const [subjects, setSubjects] = useState('영어+수학')
  const [defaultDuration, setDefaultDuration] = useState(60)

  // 수정 상태
  const [editingId, setEditingId] = useState(null)
  const [editName, setEditName] = useState('')
  const [editSchoolLevel, setEditSchoolLevel] = useState('초1')
  const [editSubjects, setEditSubjects] = useState('영어+수학')
  const [editDefaultDuration, setEditDefaultDuration] = useState(60)

  // 필터 및 검색
  const [filter, setFilter] = useState('전체')
  const [searchQuery, setSearchQuery] = useState('')
  const [now, setNow] = useState(new Date())

  // 캘린더 모달 및 실시간 과목별 누적 시간 데이터
  const [selectedStudent, setSelectedStudent] = useState(null)
  const [studentLogs, setStudentLogs] = useState([])
  const [calendarDate, setCalendarDate] = useState(new Date())
  const [allLogsMap, setAllLogsMap] = useState({})

  useEffect(() => {
    fetchStudents()

    const timer = setInterval(() => setNow(new Date()), 10000)

    const channel = supabase
      .channel('schema-db-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'students' },
        () => fetchStudents()
      )
      .subscribe()

    return () => {
      clearInterval(timer)
      supabase.removeChannel(channel)
    }
  }, [])

  async function fetchStudents() {
    const { data, error } = await supabase.from('students').select().order('id', { ascending: true })
    if (!error) {
      setStudents(data || [])
      fetchAllLogsForToday(data || [])
    }
  }

  async function fetchAllLogsForToday(studentList) {
    const { data, error } = await supabase
      .from('attendance_logs')
      .select('*')
      .order('created_at', { ascending: true })

    if (!error) {
      const logsMap = {}
      studentList.forEach(st => {
        logsMap[st.name] = calculateSubjectDurations(st, data || [])
      })
      setAllLogsMap(logsMap)
    }
  }

  async function logAttendance(studentName, subject, status) {
    try {
      const nowObj = new Date()
      const timeStr = nowObj.toLocaleString('ko-KR')
      const isoStr = nowObj.toISOString()
      await supabase.from('attendance_logs').insert([
        { 
          student_name: studentName, 
          subject: subject, 
          status: status, 
          timestamp_str: timeStr,
          created_at: isoStr
        }
      ])
    } catch (e) {}
  }

  async function addStudent(e) {
    e.preventDefault()
    if (!newName.trim()) return

    const { error } = await supabase.from('students').insert([{ 
      name: newName, 
      school_level: schoolLevel,
      subjects: subjects,
      default_duration: Number(defaultDuration),
      attendance: '미등원',
      current_subject: null,
      end_time: null
    }])

    if (error) {
      alert(`등록 실패: ${error.message}`)
    } else {
      setNewName('')
      fetchStudents()
    }
  }

  function startEdit(student) {
    setEditingId(student.id)
    setEditName(student.name)
    setEditSchoolLevel(student.school_level || '초1')
    setEditSubjects(student.subjects || '영어+수학')
    setEditDefaultDuration(student.default_duration || 60)
  }

  async function saveEdit(student) {
    if (!editName.trim()) return

    const newDuration = Number(editDefaultDuration)
    const updateData = {
      name: editName,
      school_level: editSchoolLevel,
      subjects: editSubjects,
      default_duration: newDuration
    }

    if (student.attendance === '등원') {
      const baseCheckinTime = student.first_checkin_timestamp || Date.now()
      const newEndTimeObj = new Date(baseCheckinTime + newDuration * 60000)
      const startTimeObj = new Date(baseCheckinTime)
      const startTimeStr = startTimeObj.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false })
      const endTimeStr = newEndTimeObj.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false })

      updateData.target_minutes = newDuration
      updateData.end_timestamp = newEndTimeObj.getTime()
      updateData.end_time = `${student.current_subject}(${newDuration}분): ${startTimeStr} ~ ${endTimeStr}`
    }

    const { error } = await supabase.from('students').update(updateData).eq('id', student.id)

    if (error) {
      alert(`수정 실패: ${error.message}`)
    } else {
      setEditingId(null)
      fetchStudents()
    }
  }

  // 늦게 눌렀을 때 시간을 N분 앞으로 당겨주고, 총 공부시간도 그만큼 늘어나도록 처리
  async function adjustCheckInTime(student, minutesAgo) {
    if (!student.first_checkin_timestamp) return

    const newCheckinTime = student.first_checkin_timestamp - (minutesAgo * 60000)
    const targetMins = student.target_minutes || student.default_duration || 60
    const newEndTimeObj = new Date(newCheckinTime + targetMins * 60000)

    const startTimeObj = new Date(newCheckinTime)
    const startTimeStr = startTimeObj.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false })
    const endTimeStr = newEndTimeObj.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false })

    const { error } = await supabase.from('students').update({
      first_checkin_timestamp: newCheckinTime,
      end_timestamp: newEndTimeObj.getTime(),
      end_time: `${student.current_subject}(${targetMins}분): ${startTimeStr} ~ ${endTimeStr}`
    }).eq('id', student.id)

    if (!error) {
      fetchStudents()
    }
  }

  async function deleteStudent(id, name) {
    if (!window.confirm(`${name} 학생을 정말 삭제하시겠습니까?`)) return
    const { error } = await supabase.from('students').delete().eq('id', id)
    if (!error) fetchStudents()
  }

  async function handleCheckIn(student, subject) {
    const current = new Date()
    const minutesToAdd = student.default_duration || (student.school_level?.startsWith('초') ? 60 : 90)
    const endTimeObj = new Date(current.getTime() + minutesToAdd * 60000)

    const startTimeStr = current.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false })
    const endTimeStr = endTimeObj.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false })

    await supabase.from('students').update({ 
      attendance: '등원',
      current_subject: subject,
      end_time: `${subject}(${minutesToAdd}분): ${startTimeStr} ~ ${endTimeStr}`,
      end_timestamp: endTimeObj.getTime(),
      first_checkin_timestamp: current.getTime(), 
      target_minutes: minutesToAdd                
    }).eq('id', student.id)

    await logAttendance(student.name, subject, student.attendance === '등원' ? `${subject} 전환` : '등원')
    fetchStudents()
  }

  async function handleStatusChange(student, status) {
    await supabase.from('students').update({ 
      attendance: status,
      current_subject: null,
      end_time: null,
      end_timestamp: null,
      first_checkin_timestamp: null,
      target_minutes: null
    }).eq('id', student.id)

    await logAttendance(student.name, student.current_subject || '일반', status)
    fetchStudents()
  }

  async function openStudentCalendar(student) {
    setSelectedStudent(student)
    setCalendarDate(new Date())

    const { data, error } = await supabase
      .from('attendance_logs')
      .select('*')
      .eq('student_name', student.name)
      .order('created_at', { ascending: true })

    if (!error) setStudentLogs(data || [])
  }

  const calculateSubjectDurations = (student, logs) => {
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    
    let englishMins = 0
    let mathMins = 0

    let currentSubject = null
    let startTime = null

    logs.filter(l => l.student_name === student.name).forEach((log) => {
      const logDate = log.created_at ? new Date(log.created_at) : new Date(log.timestamp_str)
      if (isNaN(logDate.getTime())) return

      const logDateStr = `${logDate.getFullYear()}-${String(logDate.getMonth() + 1).padStart(2, '0')}-${String(logDate.getDate()).padStart(2, '0')}`
      if (logDateStr !== todayStr) return

      if (log.status === '등원' || log.status.includes('전환')) {
        if (currentSubject && startTime) {
          const durationMins = Math.floor((logDate.getTime() - startTime.getTime()) / (1000 * 60))
          if (durationMins > 0 && durationMins < 600) {
            if (currentSubject === '영어') englishMins += durationMins
            if (currentSubject === '수학') mathMins += durationMins
          }
        }
        currentSubject = log.subject
        startTime = logDate
      } else if (log.status === '하원' || log.status === '미등원') {
        if (currentSubject && startTime) {
          const durationMins = Math.floor((logDate.getTime() - startTime.getTime()) / (1000 * 60))
          if (durationMins > 0 && durationMins < 600) {
            if (currentSubject === '영어') englishMins += durationMins
            if (currentSubject === '수학') mathMins += durationMins
          }
        }
        currentSubject = null
        startTime = null
      }
    })

    if (currentSubject && startTime) {
      const durationMins = Math.floor((now.getTime() - startTime.getTime()) / (1000 * 60))
      if (durationMins > 0 && durationMins < 600) {
        if (currentSubject === '영어') englishMins += durationMins
        if (currentSubject === '수학') mathMins += durationMins
      }
    }

    // [수정 핵심] 등원 상태이고 first_checkin_timestamp가 보정된 경우, 실제 현재 시각과의 차이뿐만 아니라 
    // 보정된 시작 시간(first_checkin_timestamp)을 기준으로 누적 시간이 산출되도록 반영함
    if (student.attendance === '등원' && student.first_checkin_timestamp && student.current_subject) {
      const liveMins = Math.floor((now.getTime() - student.first_checkin_timestamp) / (1000 * 60))
      if (liveMins > 0) {
        if (student.current_subject === '영어') {
          // 기존 로그 계산값에 보정된 현재 과목 시간 전체를 반영
          englishMins = Math.max(englishMins, liveMins)
        }
        if (student.current_subject === '수학') {
          mathMins = Math.max(mathMins, liveMins)
        }
      }
    }

    return {
      english: englishMins,
      math: mathMins,
      total: englishMins + mathMins
    }
  }

  const formatMinutes = (mins) => {
    if (!mins || mins <= 0) return '0분'
    const h = Math.floor(mins / 60)
    const m = mins % 60
    if (h === 0) return `${m}분`
    if (m === 0) return `${h}시간`
    return `${h}시간 ${m}분`
  }

  const filteredStudents = students
    .filter(student => {
      if (searchQuery && !student.name.includes(searchQuery)) return false
      
      const level = student.school_level || '초1'

      if (filter === '등원') return student.attendance === '등원'
      if (filter === '하원') return student.attendance === '하원'
      if (filter === '미등원') return student.attendance === '미등원' || !student.attendance
      if (filter === '초등') return level.startsWith('초')
      if (filter === '중등') return level.startsWith('중')
      if (filter === '고등') return level.startsWith('고')
      return true
    })
    .sort((a, b) => {
      const gradeA = GRADE_ORDER[a.school_level] || 99
      const gradeB = GRADE_ORDER[b.school_level] || 99
      if (gradeA !== gradeB) return gradeA - gradeB
      return a.name.localeCompare(b.name, 'ko')
    })

  const getCardStatus = (student) => {
    if (student.attendance !== '등원' || !student.end_timestamp) return 'normal'
    const isExpired = now.getTime() > student.end_timestamp
    if (!isExpired) return 'normal'
    return (student.subjects || '영어+수학') === '영어+수학' ? 'next_subject' : 'finished'
  }

  const getDailyStudySummary = () => {
    const summary = {}
    let currentSubject = null
    let startTime = null

    studentLogs.forEach((log) => {
      const logDate = log.created_at ? new Date(log.created_at) : new Date(log.timestamp_str)
      if (isNaN(logDate.getTime())) return

      const dateKey = `${logDate.getFullYear()}-${String(logDate.getMonth() + 1).padStart(2, '0')}-${String(logDate.getDate()).padStart(2, '0')}`

      if (!summary[dateKey]) {
        summary[dateKey] = { english: 0, math: 0 }
      }

      if (log.status === '등원' || log.status.includes('전환')) {
        if (currentSubject && startTime) {
          const durationMins = Math.floor((logDate.getTime() - startTime.getTime()) / (1000 * 60))
          if (durationMins > 0) {
            if (currentSubject === '영어') summary[dateKey].english += durationMins
            if (currentSubject === '수학') summary[dateKey].math += durationMins
          }
        }
        currentSubject = log.subject
        startTime = logDate
      } else if (log.status === '하원' || log.status === '미등원') {
        if (currentSubject && startTime) {
          const durationMins = Math.floor((logDate.getTime() - startTime.getTime()) / (1000 * 60))
          if (durationMins > 0) {
            if (currentSubject === '영어') summary[dateKey].english += durationMins
            if (currentSubject === '수학') summary[dateKey].math += durationMins
          }
        }
        currentSubject = null
        startTime = null
      }
    })

    return summary
  }

  const renderCalendar = () => {
    const year = calendarDate.getFullYear()
    const month = calendarDate.getMonth()

    const firstDay = new Date(year, month, 1).getDay()
    const daysInMonth = new Date(year, month + 1, 0).getDate()

    const dailySummary = getDailyStudySummary()
    const days = []

    for (let i = 0; i < firstDay; i++) {
      days.push(<div key={`empty-${i}`} style={{ padding: '8px', backgroundColor: '#fafafa', border: '1px solid #eee' }} />)
    }

    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
      const info = dailySummary[dateStr]

      const hasData = info && (info.english > 0 || info.math > 0)
      const totalMins = hasData ? (info.english + info.math) : 0

      days.push(
        <div key={day} style={{ minHeight: '60px', padding: '4px', border: '1px solid #e0e0e0', backgroundColor: hasData ? '#e8f5e9' : '#fff', borderRadius: '4px' }}>
          <div style={{ fontWeight: 'bold', fontSize: '11px', color: '#333' }}>{day}</div>
          {hasData ? (
            <div style={{ fontSize: '9px', marginTop: '2px', lineHeight: '1.2' }}>
              <div style={{ color: '#1b5e20', fontWeight: 'bold' }}>총: {formatMinutes(totalMins)}</div>
              {info.english > 0 && <div style={{ color: '#2e7d32' }}>영: {formatMinutes(info.english)}</div>}
              {info.math > 0 && <div style={{ color: '#1565c0' }}>수: {formatMinutes(info.math)}</div>}
            </div>
          ) : null}
        </div>
      )
    }

    return days
  }

  return (
    <div style={{ padding: '8px', fontFamily: 'sans-serif', maxWidth: '980px', margin: '0 auto' }}>
      <h3 style={{ margin: '0 0 10px 0' }}>📚 학원 출석 및 과목별 학습 시간 시스템</h3>

      {/* 등록 폼 */}
      <form onSubmit={addStudent} style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '10px', padding: '8px', backgroundColor: '#f5f5f5', borderRadius: '6px' }}>
        <input
          type="text"
          placeholder="학생 이름"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          style={{ flex: '2 1 120px', padding: '6px', borderRadius: '4px', border: '1px solid #ccc', fontSize: '13px' }}
        />
        <select value={schoolLevel} onChange={(e) => setSchoolLevel(e.target.value)} style={{ flex: '1 1 70px', padding: '6px', borderRadius: '4px', border: '1px solid #ccc', fontSize: '13px' }}>
          {GRADE_OPTIONS.map(g => (
            <option key={g} value={g}>{g}</option>
          ))}
        </select>
        <select value={subjects} onChange={(e) => setSubjects(e.target.value)} style={{ flex: '1 1 80px', padding: '6px', borderRadius: '4px', border: '1px solid #ccc', fontSize: '13px' }}>
          <option value="영어+수학">영어 + 수학</option>
          <option value="영어">영어만</option>
          <option value="수학">수학만</option>
        </select>

        <select value={defaultDuration} onChange={(e) => setDefaultDuration(e.target.value)} style={{ flex: '1 1 90px', padding: '6px', borderRadius: '4px', border: '1px solid #ccc', fontSize: '13px' }}>
          {DURATION_OPTIONS.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>

        <button type="submit" style={{ padding: '6px 14px', backgroundColor: '#4CAF50', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px' }}>
          등록
        </button>
      </form>

      {/* 검색 및 필터 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '10px' }}>
        <input
          type="text"
          placeholder="🔍 학생 이름 검색..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{ padding: '6px', borderRadius: '4px', border: '1px solid #ddd', fontSize: '13px' }}
        />
        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
          {['전체', '등원', '하원', '미등원', '초등', '중등', '고등'].map((tab) => {
            let countText = ''
            if (tab === '등원') countText = `(${students.filter(s => s.attendance === '등원').length})`
            if (tab === '하원') countText = `(${students.filter(s => s.attendance === '하원').length})`
            if (tab === '미등원') countText = `(${students.filter(s => s.attendance === '미등원' || !s.attendance).length})`

            return (
              <button
                key={tab}
                onClick={() => setFilter(tab)}
                style={{
                  padding: '4px 10px',
                  borderRadius: '12px',
                  border: '1px solid #ccc',
                  backgroundColor: filter === tab ? '#1976d2' : '#fff',
                  color: filter === tab ? '#fff' : '#333',
                  cursor: 'pointer',
                  fontSize: '12px',
                  fontWeight: filter === tab ? 'bold' : 'normal'
                }}
              >
                {tab} {countText}
              </button>
            )
          })}
        </div>
      </div>

      {/* 학생 목록 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        {filteredStudents.length === 0 ? (
          <p style={{ color: '#888', textAlign: 'center', padding: '10px', fontSize: '12px' }}>해당하는 학생이 없습니다.</p>
        ) : (
          filteredStudents.map((student) => {
            const isEditing = editingId === student.id
            const cardStatus = getCardStatus(student)
            
            const todayStats = allLogsMap[student.name] || { english: 0, math: 0, total: 0 }

            let bgColor = '#ffffff'
            if (cardStatus === 'next_subject') bgColor = '#fff3e0'
            if (cardStatus === 'finished') bgColor = '#ffebee'

            const userSubjects = student.subjects || '영어+수학'
            const nextSubject = student.current_subject === '영어' ? '수학' : '영어'

            return (
              <div 
                key={student.id} 
                style={{ 
                  padding: '6px 8px',
                  borderRadius: '6px',
                  border: '1px solid #e0e0e0',
                  backgroundColor: bgColor,
                  fontSize: '11px'
                }}
              >
                {isEditing ? (
                  <div style={{ display: 'flex', gap: '4px', alignItems: 'center', flexWrap: 'wrap', padding: '4px', backgroundColor: '#f9f9f9', borderRadius: '4px' }}>
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      style={{ padding: '4px', borderRadius: '3px', border: '1px solid #ccc', width: '70px', fontSize: '11px' }}
                    />
                    <select value={editSchoolLevel} onChange={(e) => setEditSchoolLevel(e.target.value)} style={{ padding: '4px', fontSize: '11px' }}>
                      {GRADE_OPTIONS.map(g => <option key={g} value={g}>{g}</option>)}
                    </select>
                    <select value={editSubjects} onChange={(e) => setEditSubjects(e.target.value)} style={{ padding: '4px', fontSize: '11px' }}>
                      <option value="영어+수학">영어+수학</option>
                      <option value="영어">영어만</option>
                      <option value="수학">수학만</option>
                    </select>
                    <select value={editDefaultDuration} onChange={(e) => setEditDefaultDuration(e.target.value)} style={{ padding: '4px', fontSize: '11px' }}>
                      {DURATION_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                    </select>
                    <button onClick={() => saveEdit(student)} style={{ padding: '3px 10px', backgroundColor: '#2196f3', color: 'white', border: 'none', borderRadius: '3px', cursor: 'pointer', fontSize: '11px' }}>저장</button>
                    <button onClick={() => setEditingId(null)} style={{ padding: '3px 10px', backgroundColor: '#9e9e9e', color: 'white', border: 'none', borderRadius: '3px', cursor: 'pointer', fontSize: '11px' }}>취소</button>
                  </div>
                ) : (
                  <div className="student-card-inner" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}>
                    
                    <div className="student-info-group" style={{ display: 'flex', alignItems: 'center', gap: '4px', width: '225px', flexShrink: 0 }}>
                      <strong style={{ fontSize: '13px', width: '50px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {student.name}
                      </strong> 
                      
                      <span style={{ color: '#666', width: '75px', whiteSpace: 'nowrap', fontSize: '10px' }}>
                        ({student.school_level || '초1'}/{userSubjects})
                      </span>

                      <span style={{ 
                        fontWeight: 'bold', 
                        width: '42px',
                        whiteSpace: 'nowrap',
                        fontSize: '11px',
                        color: student.attendance === '등원' ? '#2e7d32' : student.attendance === '하원' ? '#1565c0' : '#c62828' 
                      }}>
                        [{student.attendance || '미등원'}]
                      </span>

                      <button
                        onClick={() => openStudentCalendar(student)}
                        style={{ padding: '2px 5px', backgroundColor: '#3f51b5', color: 'white', border: 'none', borderRadius: '3px', cursor: 'pointer', fontSize: '10px', whiteSpace: 'nowrap' }}
                      >
                        📅
                      </button>
                    </div>

                    <div style={{ flex: 1, minWidth: '150px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontSize: '10px' }}>
                      {student.attendance === '등원' && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '5px', flexWrap: 'wrap' }}>
                          <span style={{ color: '#2e7d32', fontWeight: 'bold' }}>⏱️ {student.end_time}</span>
                          <select 
                            onChange={(e) => {
                              const val = Number(e.target.value)
                              if (val > 0) adjustCheckInTime(student, val)
                              e.target.value = 0
                            }}
                            defaultValue={0}
                            title="늦게 눌러서 시간 보정하기"
                            style={{ padding: '1px', fontSize: '9px', color: '#c62828', cursor: 'pointer', border: '1px solid #ccc', borderRadius: '3px' }}
                          >
                            <option value={0} disabled>⏰ 늦게 눌렀나요?</option>
                            <option value={5}>5분 전</option>
                            <option value={10}>10분 전</option>
                            <option value={15}>15분 전</option>
                            <option value={20}>20분 전</option>
                            <option value={30}>30분 전</option>
                            <option value={60}>60분 전</option>
                          </select>
                          
                          <span style={{ backgroundColor: '#e8f5e9', color: '#2e7d32', padding: '1px 4px', borderRadius: '3px', fontWeight: 'bold' }}>
                            오늘 총: {formatMinutes(todayStats.total)}
                          </span>
                          <span style={{ color: '#2e7d32' }}>(영: {formatMinutes(todayStats.english)} / 수: {formatMinutes(todayStats.math)})</span>

                          {cardStatus === 'finished' && (
                            <span style={{ color: '#c62828', fontWeight: 'bold' }}>[⏰ 목표완료]</span>
                          )}

                          {cardStatus === 'next_subject' && (
                            <button 
                              onClick={() => handleCheckIn(student, nextSubject)}
                              style={{ padding: '2px 5px', backgroundColor: '#e65100', color: 'white', border: 'none', borderRadius: '3px', cursor: 'pointer', fontSize: '10px' }}
                            >
                              👉 [{nextSubject}] 전환
                            </button>
                          )}
                        </div>
                      )}

                      {student.attendance !== '등원' && todayStats.total > 0 && (
                        <div style={{ color: '#555' }}>
                          <span style={{ fontWeight: 'bold' }}>오늘 누적: 총 {formatMinutes(todayStats.total)}</span> 
                          <span style={{ color: '#2e7d32' }}> (영어: {formatMinutes(todayStats.english)}</span>, 
                          <span style={{ color: '#1565c0' }}> 수학: {formatMinutes(todayStats.math)})</span>
                        </div>
                      )}
                    </div>

                    <div className="student-action-buttons" style={{ display: 'flex', gap: '3px', alignItems: 'center', flexShrink: 0 }}>
                      <div style={{ width: '52px' }}>
                        {(userSubjects.includes('영어') || userSubjects === '영어+수학') && (
                          <button onClick={() => handleCheckIn(student, '영어')} style={{ width: '100%', padding: '3px 0', backgroundColor: student.current_subject === '영어' ? '#4caf50' : '#e0e0e0', color: student.current_subject === '영어' ? 'white' : 'black', border: 'none', borderRadius: '3px', cursor: 'pointer', fontSize: '10px' }}>
                            등원(영)
                          </button>
                        )}
                      </div>

                      <div style={{ width: '52px' }}>
                        {(userSubjects.includes('수학') || userSubjects === '영어+수학') && (
                          <button onClick={() => handleCheckIn(student, '수학')} style={{ width: '100%', padding: '3px 0', backgroundColor: student.current_subject === '수학' ? '#2e7d32' : '#e0e0e0', color: student.current_subject === '수학' ? 'white' : 'black', border: 'none', borderRadius: '3px', cursor: 'pointer', fontSize: '10px' }}>
                            등원(수)
                          </button>
                        )}
                      </div>

                      <button onClick={() => handleStatusChange(student, '하원')} style={{ padding: '3px 6px', backgroundColor: student.attendance === '하원' ? '#2196f3' : '#e0e0e0', color: student.attendance === '하원' ? 'white' : 'black', border: 'none', borderRadius: '3px', cursor: 'pointer', fontSize: '10px' }}>
                        하원
                      </button>

                      <button onClick={() => handleStatusChange(student, '미등원')} style={{ padding: '3px 6px', backgroundColor: student.attendance === '미등원' ? '#f44336' : '#e0e0e0', color: student.attendance === '미등원' ? 'white' : 'black', border: 'none', borderRadius: '3px', cursor: 'pointer', fontSize: '10px' }}>
                        미등원
                      </button>

                      <button onClick={() => startEdit(student)} style={{ padding: '3px 5px', backgroundColor: '#757575', color: 'white', border: 'none', borderRadius: '3px', cursor: 'pointer', fontSize: '10px' }}>
                        수정
                      </button>
                      <button onClick={() => deleteStudent(student.id, student.name)} style={{ padding: '3px 5px', backgroundColor: '#ff9800', color: 'white', border: 'none', borderRadius: '3px', cursor: 'pointer', fontSize: '10px' }}>
                        삭제
                      </button>
                    </div>

                  </div>
                )}
              </div>
            )
          })
        )}
      </div>

      {selectedStudent && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 1000
        }}>
          <div style={{
            backgroundColor: 'white',
            padding: '16px',
            borderRadius: '8px',
            maxWidth: '500px',
            width: '92%',
            maxHeight: '90vh',
            overflowY: 'auto'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <h3 style={{ margin: 0, fontSize: '15px' }}>📊 {selectedStudent.name} 학생 학습 달력</h3>
              <button 
                onClick={() => setSelectedStudent(null)}
                style={{ backgroundColor: '#f44336', color: 'white', border: 'none', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}
              >
                닫기
              </button>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <button 
                onClick={() => setCalendarDate(new Date(calendarDate.getFullYear(), calendarDate.getMonth() - 1, 1))}
                style={{ padding: '4px 8px', cursor: 'pointer', fontSize: '12px' }}
              >
                ◀ 이전달
              </button>
              <strong style={{ fontSize: '14px' }}>{calendarDate.getFullYear()}년 {calendarDate.getMonth() + 1}월</strong>
              <button 
                onClick={() => setCalendarDate(new Date(calendarDate.getFullYear(), calendarDate.getMonth() + 1, 1))}
                style={{ padding: '4px 8px', cursor: 'pointer', fontSize: '12px' }}
              >
                다음달 ▶
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', textAlign: 'center', fontWeight: 'bold', fontSize: '11px', marginBottom: '6px' }}>
              <div style={{ color: 'red' }}>일</div>
              <div>월</div>
              <div>화</div>
              <div>수</div>
              <div>목</div>
              <div>금</div>
              <div style={{ color: 'blue' }}>토</div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '3px' }}>
              {renderCalendar()}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default App