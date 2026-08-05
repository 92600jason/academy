import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'
import './App.css'

const GRADE_OPTIONS = [
  '초1', '초2', '초3', '초4', '초5', '초6',
  '중1', '중2', '중3',
  '고1', '고2', '고3'
]

const GRADE_ORDER = {
  '초1': 1, '초2': 2, '초3': 3, '초4': 4, '초5': 5, '초6': 6,
  '중1': 7, '중2': 8, '중3': 9,
  '고1': 10, '고2': 11, '고3': 12
}

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
  const [userRole, setUserRole] = useState(() => {
    return localStorage.getItem('academy_user_role') || null
  })
  const [passwordInput, setPasswordInput] = useState('')

  const [students, setStudents] = useState([])
  const [newName, setNewName] = useState('')
  const [schoolLevel, setSchoolLevel] = useState('초1')
  const [subjects, setSubjects] = useState('영어+수학')
  const [defaultDuration, setDefaultDuration] = useState(60)

  const [editingId, setEditingId] = useState(null)
  const [editName, setEditName] = useState('')
  const [editSchoolLevel, setEditSchoolLevel] = useState('초1')
  const [editSubjects, setEditSubjects] = useState('영어+수학')
  const [editDefaultDuration, setEditDefaultDuration] = useState(60)

  const [filter, setFilter] = useState('전체')
  const [searchQuery, setSearchQuery] = useState('')
  
  const [now, setNow] = useState(new Date())

  const [selectedStudent, setSelectedStudent] = useState(null)
  const [studentLogs, setStudentLogs] = useState([])
  const [calendarDate, setCalendarDate] = useState(new Date())
  const [allLogsMap, setAllLogsMap] = useState({})

  useEffect(() => {
    if (!userRole) return

    fetchStudents()

    const timer = setInterval(() => setNow(new Date()), 1000)

    const handleFocus = () => {
      fetchStudents()
    }
    window.addEventListener('focus', handleFocus)

    const studentChannel = supabase
      .channel('schema-db-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'students' },
        () => fetchStudents()
      )
      .subscribe()

    const logChannel = supabase
      .channel('schema-log-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'attendance_logs' },
        () => fetchStudents()
      )
      .subscribe()

    return () => {
      clearInterval(timer)
      window.removeEventListener('focus', handleFocus)
      supabase.removeChannel(studentChannel)
      supabase.removeChannel(logChannel)
    }
  }, [userRole])

  function handleLogin(e) {
    e.preventDefault()
    let role = null
    if (passwordInput === '1234') role = 'director'
    else if (passwordInput === '1111') role = 'english'
    else if (passwordInput === '2222') role = 'math'

    if (role) {
      setUserRole(role)
      localStorage.setItem('academy_user_role', role)
    } else {
      alert('비밀번호가 틀렸습니다.\n(원장:1234 / 영어:1111 / 수학:2222)')
    }
    setPasswordInput('')
  }

  function handleLogout() {
    setUserRole(null)
    localStorage.removeItem('academy_user_role')
  }

  async function fetchStudents() {
    const { data, error } = await supabase.from('students').select().order('id', { ascending: true })
    if (!error) {
      const studentList = data || []
      setStudents(studentList)
      fetchAllLogsForToday(studentList)
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
      default_duration: newDuration
    }

    // 원장님만 이름, 학년, 과목 구성을 수정할 수 있음
    if (userRole === 'director') {
      updateData.name = editName
      updateData.school_level = editSchoolLevel
      updateData.subjects = editSubjects
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
    if (userRole !== 'director') {
      alert('삭제 권한은 원장님에게만 있습니다.')
      return
    }
    if (!window.confirm(`${name} 학생을 정말 삭제하시겠습니까?`)) return
    const { error } = await supabase.from('students').delete().eq('id', id)
    if (!error) fetchStudents()
  }

  async function handleCheckIn(student, subject) {
    const current = new Date()
    const minutesToAdd = student.default_duration || 60
    const endTimeObj = new Date(current.getTime() + minutesToAdd * 60000)

    const startTimeStr = current.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false })
    const endTimeStr = endTimeObj.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false })

    const isSwitching = student.attendance === '등원' && student.current_subject && student.current_subject !== subject

    if (isSwitching) {
      await logAttendance(student.name, student.current_subject, `${student.current_subject} 종료`)
    }

    await supabase.from('students').update({ 
      attendance: '등원',
      current_subject: subject,
      end_time: `${subject}(${minutesToAdd}분): ${startTimeStr} ~ ${endTimeStr}`,
      end_timestamp: endTimeObj.getTime(),
      first_checkin_timestamp: current.getTime(), 
      target_minutes: minutesToAdd                     
    }).eq('id', student.id)

    const logStatus = student.attendance === '등원' ? `${subject} 전환` : '등원'
    await logAttendance(student.name, subject, logStatus)
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
      } else if (log.status === '하원' || log.status === '미등원' || log.status.includes('종료')) {
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

    if (student.attendance === '등원' && student.first_checkin_timestamp && student.current_subject) {
      const liveMins = Math.floor((now.getTime() - student.first_checkin_timestamp) / (1000 * 60))
      if (liveMins > 0) {
        if (student.current_subject === '영어') {
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

  // 👑 선생님 모드별 과목 필터링 적용 (원장: 전부, 영어쌤: 영어 관련, 수학쌤: 수학 관련)
  const roleFilteredStudents = students.filter(student => {
    const userSubjects = student.subjects || '영어+수학'
    if (userRole === 'english') {
      // 영어쌤 화면: 영어가 포함되어 있으면서, 현재 수학 수업 중(등원 상태에서 current_subject가 수학)이 아닌 학생들만 표시
      const isEnglishIncluded = userSubjects.includes('영어')
      const isCurrentlyMath = student.attendance === '등원' && student.current_subject === '수학'
      return isEnglishIncluded && !isCurrentlyMath
    }
    if (userRole === 'math') {
      // 수학쌤 화면: 수학이 포함되어 있으면서, 현재 영어 수업 중(등원 상태에서 current_subject가 영어)이 아닌 학생들만 표시
      const isMathIncluded = userSubjects.includes('수학')
      const isCurrentlyEnglish = student.attendance === '등원' && student.current_subject === '영어'
      return isMathIncluded && !isCurrentlyEnglish
    }
    return true // 원장님은 전체 보기
  })

  const filteredStudents = roleFilteredStudents
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
      } else if (log.status === '하원' || log.status === '미등원' || log.status.includes('종료')) {
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
      days.push(<div key={`empty-${i}`} className="calendar-empty" />)
    }

    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
      const info = dailySummary[dateStr]

      const hasData = info && (info.english > 0 || info.math > 0)
      const totalMins = hasData ? (info.english + info.math) : 0

      days.push(
        <div key={day} className={`calendar-day ${hasData ? 'has-data' : ''}`}>
          <div className="calendar-day-number">{day}</div>
          {hasData ? (
            <div className="calendar-day-info">
              <div className="calendar-total">총: {formatMinutes(totalMins)}</div>
              {info.english > 0 && <div className="calendar-eng">영: {formatMinutes(info.english)}</div>}
              {info.math > 0 && <div className="calendar-math">수: {formatMinutes(info.math)}</div>}
            </div>
          ) : null}
        </div>
      )
    }

    return days
  }

  if (!userRole) {
    return (
      <div className="login-container">
        <form onSubmit={handleLogin} className="login-form">
          <h2 className="login-title">🔐 학원 시스템 로그인</h2>
          <p className="login-desc">
            비밀번호를 입력해 주세요.<br/>
            (원장: 1234 / 영어: 1111 / 수학: 2222)
          </p>
          <input
            type="password"
            placeholder="비밀번호 입력"
            value={passwordInput}
            onChange={(e) => setPasswordInput(e.target.value)}
            className="login-input"
            autoFocus
          />
          <button type="submit" className="login-btn">
            로그인
          </button>
        </form>
      </div>
    )
  }

  return (
    <div className="app-container">
      <div className="app-header">
        <h2 className="app-title">
          📚 학원 출석 및 학습 시간 시스템 
          <span className="app-role-badge">
            ({userRole === 'director' ? '👑 원장 모드 (전체)' : userRole === 'english' ? '📖 영어 선생님 모드' : '📐 수학 선생님 모드'})
          </span>
        </h2>
        <button onClick={handleLogout} className="logout-btn">
          로그아웃
        </button>
      </div>

      {userRole === 'director' && (
        <form onSubmit={addStudent} className="register-form">
          <input
            type="text"
            placeholder="학생 이름"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            className="form-input name-input"
          />
          <select value={schoolLevel} onChange={(e) => setSchoolLevel(e.target.value)} className="form-select level-select">
            {GRADE_OPTIONS.map(g => (
              <option key={g} value={g}>{g}</option>
            ))}
          </select>
          <select value={subjects} onChange={(e) => setSubjects(e.target.value)} className="form-select subject-select">
            <option value="영어+수학">영어 + 수학</option>
            <option value="영어">영어만</option>
            <option value="수학">수학만</option>
          </select>

          <select value={defaultDuration} onChange={(e) => setDefaultDuration(e.target.value)} className="form-select duration-select">
            {DURATION_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>

          <button type="submit" className="submit-btn">
            등록
          </button>
        </form>
      )}

      <div className="search-filter-container">
        <input
          type="text"
          placeholder="🔍 학생 이름 검색..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="search-input"
        />
        <div className="filter-tabs">
          {['전체', '등원', '하원', '미등원', '초등', '중등', '고등'].map((tab) => {
            let countText = ''
            if (tab === '등원') countText = `(${roleFilteredStudents.filter(s => s.attendance === '등원').length})`
            if (tab === '하원') countText = `(${roleFilteredStudents.filter(s => s.attendance === '하원').length})`
            if (tab === '미등원') countText = `(${roleFilteredStudents.filter(s => s.attendance === '미등원' || !s.attendance).length})`

            return (
              <button
                key={tab}
                onClick={() => setFilter(tab)}
                className={`filter-tab-btn ${filter === tab ? 'active' : ''}`}
              >
                {tab} {countText}
              </button>
            )
          })}
        </div>
      </div>

      <div className="student-list">
        {filteredStudents.length === 0 ? (
          <p className="no-students">해당하는 학생이 없습니다.</p>
        ) : (
          filteredStudents.map((student) => {
            const isEditing = editingId === student.id
            const cardStatus = getCardStatus(student)
            
            const todayStats = allLogsMap[student.name] || { english: 0, math: 0, total: 0 }

            let cardBgClass = 'card-normal'
            if (cardStatus === 'next_subject') cardBgClass = 'card-next-subject'
            if (cardStatus === 'finished') cardBgClass = 'card-finished'

            const userSubjects = student.subjects || '영어+수학'
            const nextSubject = student.current_subject === '영어' ? '수학' : '영어'

            return (
              <div key={student.id} className={`student-card ${cardBgClass}`}>
                {isEditing ? (
                  <div className="edit-form">
                    {/* 원장님만 이름, 학년, 과목 수정 가능 / 선생님은 시간 설정만 가능 */}
                    {userRole === 'director' ? (
                      <>
                        <input
                          type="text"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          className="edit-name-input"
                        />
                        <select value={editSchoolLevel} onChange={(e) => setEditSchoolLevel(e.target.value)} className="edit-select">
                          {GRADE_OPTIONS.map(g => <option key={g} value={g}>{g}</option>)}
                        </select>
                        <select value={editSubjects} onChange={(e) => setEditSubjects(e.target.value)} className="edit-select">
                          <option value="영어+수학">영어+수학</option>
                          <option value="영어">영어만</option>
                          <option value="수학">수학만</option>
                        </select>
                      </>
                    ) : (
                      <span className="edit-notice-text">⏰ 기본 수업 시간 수정</span>
                    )}

                    <select value={editDefaultDuration} onChange={(e) => setEditDefaultDuration(e.target.value)} className="edit-select">
                      {DURATION_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                    </select>
                    <button onClick={() => saveEdit(student)} className="save-btn">저장</button>
                    <button onClick={() => setEditingId(null)} className="cancel-btn">취소</button>
                  </div>
                ) : (
                  <div className="student-card-content">
                    <div className="card-top-row">
                      <div className="card-left-info">
                        <strong className="student-name">{student.name}</strong> 
                        <span className="student-meta">({student.school_level || '초1'} / {userSubjects})</span>
                        <span className={`attendance-badge ${student.attendance === '등원' ? 'status-attending' : student.attendance === '하원' ? 'status-leaving' : 'status-absent'}`}>
                          [{student.attendance || '미등원'}]
                        </span>
                        <button onClick={() => openStudentCalendar(student)} className="calendar-open-btn">
                          📅 달력
                        </button>
                      </div>

                      <div className="card-actions">
                        {(userRole === 'director' || userRole === 'english') && (userSubjects === '영어' || userSubjects === '영어+수학') && (
                          <button onClick={() => handleCheckIn(student, '영어')} className={`action-btn ${student.current_subject === '영어' ? 'btn-eng-active' : 'btn-default'}`}>
                            등원(영)
                          </button>
                        )}
                        {(userRole === 'director' || userRole === 'math') && (userSubjects === '수학' || userSubjects === '영어+수학') && (
                          <button onClick={() => handleCheckIn(student, '수학')} className={`action-btn ${student.current_subject === '수학' ? 'btn-math-active' : 'btn-default'}`}>
                            등원(수)
                          </button>
                        )}

                        <button onClick={() => handleStatusChange(student, '하원')} className={`action-btn ${student.attendance === '하원' ? 'btn-leave-active' : 'btn-default'}`}>
                          하원
                        </button>
                        <button onClick={() => handleStatusChange(student, '미등원')} className={`action-btn ${student.attendance === '미등원' ? 'btn-absent-active' : 'btn-default'}`}>
                          미등원
                        </button>
                        <button onClick={() => startEdit(student)} className="utility-btn btn-edit">수정</button>
                        {userRole === 'director' && (
                          <button onClick={() => deleteStudent(student.id, student.name)} className="utility-btn btn-delete">삭제</button>
                        )}
                      </div>
                    </div>

                    {student.attendance === '등원' && (
                      <div className="attending-details">
                        <span className="end-time-text">⏱️ {student.end_time}</span>
                        <select 
                          onChange={(e) => {
                            const val = Number(e.target.value)
                            if (val > 0) adjustCheckInTime(student, val)
                            e.target.value = 0
                          }}
                          defaultValue={0}
                          className="time-adjust-select"
                        >
                          <option value={0} disabled>⏰ 늦게 눌렀나요?</option>
                          <option value={5}>5분 전</option>
                          <option value={10}>10분 전</option>
                          <option value={15}>15분 전</option>
                          <option value={20}>20분 전</option>
                          <option value={30}>30분 전</option>
                          <option value={60}>60분 전</option>
                        </select>
                        <span className="today-total-badge">
                          오늘 총: {formatMinutes(todayStats.total)}
                        </span>
                        <span className="subject-breakdown">(영: {formatMinutes(todayStats.english)} / 수: {formatMinutes(todayStats.math)})</span>

                        {cardStatus === 'finished' && (
                          <span className="finished-text">[⏰ 목표완료]</span>
                        )}

                        {cardStatus === 'next_subject' && (
                          <button onClick={() => handleCheckIn(student, nextSubject)} className="switch-subject-btn">
                            👉 [{nextSubject}] 전환
                          </button>
                        )}
                      </div>
                    )}

                    {student.attendance !== '등원' && todayStats.total > 0 && (
                      <div className="non-attending-summary">
                        <span className="summary-total">오늘 누적: 총 {formatMinutes(todayStats.total)}</span> 
                        <span className="summary-eng"> (영어: {formatMinutes(todayStats.english)}</span>, 
                        <span className="summary-math"> 수학: {formatMinutes(todayStats.math)})</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>

      {selectedStudent && (
        <div className="modal-backdrop">
          <div className="modal-box">
            <div className="modal-header">
              <h3 className="modal-title">📊 {selectedStudent.name} 학생 학습 달력</h3>
              <button onClick={() => setSelectedStudent(null)} className="modal-close-btn">닫기</button>
            </div>

            <div className="modal-nav-row">
              <button onClick={() => setCalendarDate(new Date(calendarDate.getFullYear(), calendarDate.getMonth() - 1, 1))} className="modal-nav-btn">
                ◀ 이전달
              </button>
              <strong className="modal-current-month">{calendarDate.getFullYear()}년 {calendarDate.getMonth() + 1}월</strong>
              <button onClick={() => setCalendarDate(new Date(calendarDate.getFullYear(), calendarDate.getMonth() + 1, 1))} className="modal-nav-btn">
                다음달 ▶
              </button>
            </div>

            <div className="calendar-header-grid">
              <div className="day-sun">일</div>
              <div>월</div>
              <div>화</div>
              <div>수</div>
              <div>목</div>
              <div>금</div>
              <div className="day-sat">토</div>
            </div>

            <div className="calendar-grid">
              {renderCalendar()}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default App