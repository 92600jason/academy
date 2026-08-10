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
  const [sortCategory, setSortCategory] = useState('default') // 'default', 'grade'
  const [searchQuery, setSearchQuery] = useState('')
  
  const [tick, setTick] = useState(0)
  const now = new Date()

  useEffect(() => {
    const timer = setInterval(() => {
      setTick(prev => prev + 1)
    }, 1000)
    
    return () => clearInterval(timer)
  }, [])

  const [selectedStudent, setSelectedStudent] = useState(null)
  const [studentLogs, setStudentLogs] = useState([])
  const [calendarDate, setCalendarDate] = useState(new Date())
  const [todayLogsData, setTodayLogsData] = useState([])

  useEffect(() => {
    if (!userRole) return

    fetchStudents()
    fetchLogsForTodayOnly()

    const handleFocus = () => {
      fetchStudents()
      fetchLogsForTodayOnly()
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
        () => {
          fetchStudents()
          fetchLogsForTodayOnly()
        }
      )
      .subscribe()

    return () => {
      window.removeEventListener('focus', handleFocus)
      supabase.removeChannel(studentChannel)
      supabase.removeChannel(logChannel)
    }
  }, [userRole])

  function handleLogin(e) {
    e.preventDefault()
    let role = null
    if (passwordInput === '4507') role = 'director'
    else if (passwordInput === '0000') role = 'english'
    else if (passwordInput === '0926') role = 'math'

    if (role) {
      setUserRole(role)
      localStorage.setItem('academy_user_role', role)
    } else {
      alert('비밀번호가 틀렸습니다.')
    }
    setPasswordInput('')
  }

  function handleLogout() {
    setUserRole(null)
    localStorage.removeItem('academy_user_role')
  }

  async function fetchStudents() {
    const { data, error } = await supabase.from('students').select().order('id', { ascending: true })
    if (!error && data) {
      const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
      
      const updatedStudents = await Promise.all(
        data.map(async (student) => {
          if (student.attendance === '등원' && student.first_checkin_timestamp) {
            const checkinDate = new Date(student.first_checkin_timestamp)
            const checkinDateStr = `${checkinDate.getFullYear()}-${String(checkinDate.getMonth() + 1).padStart(2, '0')}-${String(checkinDate.getDate()).padStart(2, '0')}`
            
            if (checkinDateStr !== todayStr) {
              await supabase.from('students').update({
                attendance: '미등원',
                current_subject: null,
                end_time: null,
                end_timestamp: null,
                first_checkin_timestamp: null,
                target_minutes: null,
                completed_subjects: []
              }).eq('id', student.id)

              return {
                ...student,
                attendance: '미등원',
                current_subject: null,
                end_time: null,
                end_timestamp: null,
                first_checkin_timestamp: null,
                target_minutes: null,
                completed_subjects: []
              }
            }
          }
          return student
        })
      )
      setStudents(updatedStudents)
    }
  }

  async function fetchLogsForTodayOnly() {
    const { data, error } = await supabase
      .from('attendance_logs')
      .select('*')
      .order('created_at', { ascending: true })

    if (!error) {
      setTodayLogsData(data || [])
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
      end_time: null,
      completed_subjects: []
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

    let completedList = student.completed_subjects || []
    if (isSwitching && student.current_subject) {
      if (!completedList.includes(student.current_subject)) {
        completedList.push(student.current_subject)
      }
      await logAttendance(student.name, student.current_subject, `${student.current_subject} 종료`)
    }

    await supabase.from('students').update({ 
      attendance: '등원',
      current_subject: subject,
      end_time: `${subject}(${minutesToAdd}분): ${startTimeStr} ~ ${endTimeStr}`,
      end_timestamp: endTimeObj.getTime(),
      first_checkin_timestamp: current.getTime(), 
      target_minutes: minutesToAdd,
      completed_subjects: completedList
    }).eq('id', student.id)

    const logStatus = student.attendance === '등원' ? `${subject} 전환` : '등원'
    await logAttendance(student.name, subject, logStatus)
    fetchStudents()
    fetchLogsForTodayOnly()
  }

  async function handleStatusChange(student, status) {
    let updateData = { 
      attendance: status,
      current_subject: null,
      end_time: null,
      end_timestamp: null,
      first_checkin_timestamp: null,
      target_minutes: null,
      completed_subjects: []
    }

    await supabase.from('students').update(updateData).eq('id', student.id)

    await logAttendance(student.name, student.current_subject || '일반', status)
    fetchStudents()
    fetchLogsForTodayOnly()
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
    
    let englishMs = 0
    let mathMs = 0

    let currentSubject = null
    let startTime = null

    logs.filter(l => l.student_name === student.name).forEach((log) => {
      const logDate = log.created_at ? new Date(log.created_at) : new Date(log.timestamp_str)
      if (isNaN(logDate.getTime())) return

      const logDateStr = `${logDate.getFullYear()}-${String(logDate.getMonth() + 1).padStart(2, '0')}-${String(logDate.getDate()).padStart(2, '0')}`
      if (logDateStr !== todayStr) return

      if (log.status === '등원' || log.status.includes('전환')) {
        if (currentSubject && startTime) {
          const diff = logDate.getTime() - startTime.getTime()
          if (diff > 0 && diff < 21600000) {
            if (currentSubject === '영어') englishMs += diff
            if (currentSubject === '수학') mathMs += diff
          }
        }
        currentSubject = log.subject
        startTime = logDate
      } else if (log.status === '하원' || log.status === '미등원' || log.status.includes('종료')) {
        if (currentSubject && startTime) {
          const diff = logDate.getTime() - startTime.getTime()
          if (diff > 0 && diff < 21600000) {
            if (currentSubject === '영어') englishMs += diff
            if (currentSubject === '수학') mathMs += diff
          }
        }
        currentSubject = null
        startTime = null
      }
    })

    if (currentSubject && startTime) {
      const diff = now.getTime() - startTime.getTime()
      if (diff > 0 && diff < 21600000) {
        if (currentSubject === '영어') englishMs += diff
        if (currentSubject === '수학') mathMs += diff
      }
    }

    if (student.attendance === '등원' && student.first_checkin_timestamp && student.current_subject) {
      const liveDiff = now.getTime() - student.first_checkin_timestamp
      if (liveDiff > 0) {
        if (student.current_subject === '영어') {
          englishMs = Math.max(englishMs, liveDiff)
        }
        if (student.current_subject === '수학') {
          mathMs = Math.max(mathMs, liveDiff)
        }
      }
    }

    return {
      english: englishMs,
      math: mathMs,
      total: englishMs + mathMs
    }
  }

  const formatMillisWithSeconds = (ms) => {
    if (!ms || ms <= 0) return '0분 0초'
    const totalSecs = Math.floor(ms / 1000)
    const h = Math.floor(totalSecs / 3600)
    const m = Math.floor((totalSecs % 3600) / 60)
    const s = totalSecs % 60

    if (h === 0) return `${m}분 ${s}초`
    return `${h}시간 ${m}분 ${s}초`
  }

  const formatMillisForCalendar = (ms) => {
    if (!ms || ms <= 0) return '0분'
    const mins = Math.floor(ms / 60000)
    const h = Math.floor(mins / 60)
    const m = mins % 60
    if (h === 0) return `${m}분`
    if (m === 0) return `${h}시간`
    return `${h}시간 ${m}분`
  }

  const roleFilteredStudents = students.filter(student => {
    const userSubjects = student.subjects || '영어+수학'
    if (userRole === 'english') {
      const isEnglishIncluded = userSubjects.includes('영어')
      const isCurrentlyMath = student.attendance === '등원' && student.current_subject === '수학'
      return isEnglishIncluded && !isCurrentlyMath
    }
    if (userRole === 'math') {
      const isMathIncluded = userSubjects.includes('수학')
      const isCurrentlyEnglish = student.attendance === '등원' && student.current_subject === '영어'
      return isMathIncluded && !isCurrentlyEnglish
    }
    return true
  })

  const getCardStatus = (student) => {
    if (student.attendance !== '등원' || !student.end_timestamp) return 'normal'
    const isExpired = now.getTime() > student.end_timestamp
    if (!isExpired) return 'normal'

    const userSubjects = student.subjects || '영어+수학'
    const completed = student.completed_subjects || []

    if (userSubjects === '영어+수학') {
      const totalRequired = 2
      const currentDoneCount = completed.length + 1
      if (currentDoneCount < totalRequired) {
        return 'next_subject'
      } else {
        return 'finished'
      }
    } else {
      return 'finished'
    }
  }

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
      if (sortCategory === 'default') {
        const getStatusPriority = (s) => {
          if (s.attendance === '등원') return 1
          if (s.attendance === '미등원' || !s.attendance) return 2
          if (s.attendance === '하원') return 3
          return 4
        }
        const pA = getStatusPriority(a)
        const pB = getStatusPriority(b)
        if (pA !== pB) return pA - pB

        if (a.attendance === '등원' && b.attendance === '등원') {
          const timeA = a.end_timestamp || 0
          const timeB = b.end_timestamp || 0
          if (timeA !== timeB) return timeA - timeB
        }

        const gradeA = GRADE_ORDER[a.school_level] || 99
        const gradeB = GRADE_ORDER[b.school_level] || 99
        if (gradeA !== gradeB) return gradeA - gradeB

        return a.name.localeCompare(b.name, 'ko')
      }

      if (sortCategory === 'grade') {
        const gradeA = GRADE_ORDER[a.school_level] || 99
        const gradeB = GRADE_ORDER[b.school_level] || 99
        if (gradeA !== gradeB) return gradeA - gradeB

        return a.name.localeCompare(b.name, 'ko')
      }

      return 0
    })

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
          const diff = logDate.getTime() - startTime.getTime()
          if (diff > 0) {
            if (currentSubject === '영어') summary[dateKey].english += diff
            if (currentSubject === '수학') summary[dateKey].math += diff
          }
        }
        currentSubject = log.subject
        startTime = logDate
      } else if (log.status === '하원' || log.status === '미등원' || log.status.includes('종료')) {
        if (currentSubject && startTime) {
          const diff = logDate.getTime() - startTime.getTime()
          if (diff > 0) {
            if (currentSubject === '영어') summary[dateKey].english += diff
            if (currentSubject === '수학') summary[dateKey].math += diff
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
      const totalMs = hasData ? (info.english + info.math) : 0

      days.push(
        <div key={day} className={`calendar-day ${hasData ? 'has-data' : ''}`}>
          <div className="calendar-day-number">{day}</div>
          {hasData ? (
            <div className="calendar-day-info">
              <div className="calendar-total">총: {formatMillisForCalendar(totalMs)}</div>
              {info.english > 0 && <div className="calendar-eng">영: {formatMillisForCalendar(info.english)}</div>}
              {info.math > 0 && <div className="calendar-math">수: {formatMillisForCalendar(info.math)}</div>}
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
            비밀번호를 입력해 주세요.
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
            <option value="영어만">영어만</option>
            <option value="수학만">수학만</option>
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

        {/* 상태/그룹 필터 탭 */}
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

        {/* [정렬 카테고리 선택 영역] */}
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '12px', padding: '10px', backgroundColor: '#eff6ff', borderRadius: '8px', border: '1px solid #bfdbfe' }}>
          <span style={{ fontSize: '14px', fontWeight: 'bold', color: '#1e40af' }}>🔄 정렬:</span>
          <button
            onClick={() => setSortCategory('default')}
            style={{ padding: '6px 12px', borderRadius: '4px', border: 'none', background: sortCategory === 'default' ? '#2563eb' : '#e2e8f0', color: sortCategory === 'default' ? '#fff' : '#334155', cursor: 'pointer', fontWeight: 'bold' }}
          >
            기본 정렬
          </button>
          <button
            onClick={() => setSortCategory('grade')}
            style={{ padding: '6px 12px', borderRadius: '4px', border: 'none', background: sortCategory === 'grade' ? '#2563eb' : '#e2e8f0', color: sortCategory === 'grade' ? '#fff' : '#334155', cursor: 'pointer', fontWeight: 'bold' }}
          >
            학년 순
          </button>
        </div>
      </div>

      <div className="student-list">
        {filteredStudents.length === 0 ? (
          <p className="no-students">해당하는 학생이 없습니다.</p>
        ) : (
          filteredStudents.map((student) => {
            const isEditing = editingId === student.id
            const cardStatus = getCardStatus(student)
            
            const todayStats = calculateSubjectDurations(student, todayLogsData)

            let cardBgClass = 'card-normal'
            if (cardStatus === 'next_subject') cardBgClass = 'card-next-subject'
            if (cardStatus === 'finished') cardBgClass = 'card-finished'

            const userSubjects = student.subjects || '영어+수학'
            const nextSubject = student.current_subject === '영어' ? '수학' : '영어'

            return (
              <div key={student.id} className={`student-card ${cardBgClass}`}>
                {isEditing ? (
                  <div className="edit-form">
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
                          <option value="영어만">영어만</option>
                          <option value="수학만">수학만</option>
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
                        <button onClick={() => openStudentCalendar(student)} className="calendar-open-btn">
                          📅 달력
                        </button>
                      </div>

                      <div className="card-actions">
                        {(userRole === 'director' || userRole === 'english') && (userSubjects.includes('영어')) && (
                          <button 
                            onClick={() => handleCheckIn(student, '영어')} 
                            className={`action-btn ${student.attendance === '등원' && student.current_subject === '영어' ? 'btn-eng-active' : 'btn-default'}`}
                          >
                            등원(영)
                          </button>
                        )}
                        {(userRole === 'director' || userRole === 'math') && (userSubjects.includes('수학')) && (
                          <button 
                            onClick={() => handleCheckIn(student, '수학')} 
                            className={`action-btn ${student.attendance === '등원' && student.current_subject === '수학' ? 'btn-math-active' : 'btn-default'}`}
                          >
                            등원(수)
                          </button>
                        )}

                        <button 
                          onClick={() => handleStatusChange(student, '하원')} 
                          className={`action-btn ${student.attendance === '하원' ? 'btn-leave-active' : 'btn-default'}`}
                        >
                          하원
                        </button>
                        <button 
                          onClick={() => handleStatusChange(student, '미등원')} 
                          className={`action-btn ${student.attendance === '미등원' ? 'btn-absent-active' : 'btn-default'}`}
                        >
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
                          오늘 총: {formatMillisWithSeconds(todayStats.total)}
                        </span>
                        <span className="subject-breakdown">(영: {formatMillisWithSeconds(todayStats.english)} / 수: {formatMillisWithSeconds(todayStats.math)})</span>

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
                        <span className="summary-total">오늘 누적: 총 {formatMillisWithSeconds(todayStats.total)}</span> 
                        <span className="summary-eng"> (영어: {formatMillisWithSeconds(todayStats.english)}</span>, 
                        <span className="summary-math"> 수학: {formatMillisWithSeconds(todayStats.math)})</span>
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