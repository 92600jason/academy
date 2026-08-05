import React, { useState, useEffect } from 'react'
import { supabase } from './supabaseClient'
import './App.css'

function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [userRole, setUserRole] = useState('') // 'director', 'english', 'math'
  const [passwordInput, setPasswordInput] = useState('')
  const [selectedRoleOption, setSelectedRoleOption] = useState('director')

  const [students, setStudents] = useState([])
  const [logs, setLogs] = useState([])
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0])
  const [activeTab, setActiveTab] = useState('all') 
  const [searchTerm, setSearchTerm] = useState('')

  // 신규 등록 폼 (학과 제거, 학년 추가)
  const [newName, setNewName] = useState('')
  const [newSchool, setNewSchool] = useState('')
  const [newGrade, setNewGrade] = useState('')
  const [newParentPhone, setNewParentPhone] = useState('')
  const [newSubjects, setNewSubjects] = useState('영어+수학')

  // 수정 모달
  const [editingStudent, setEditingStudent] = useState(null)
  const [editName, setEditName] = useState('')
  const [editSchool, setEditSchool] = useState('')
  const [editGrade, setEditGrade] = useState('')
  const [editParentPhone, setEditParentPhone] = useState('')
  const [editSubjects, setEditSubjects] = useState('영어+수학')

  useEffect(() => {
    if (isLoggedIn) {
      fetchStudents()
      fetchLogs(selectedDate)

      const channel = supabase
        .channel('attendance-changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'attendance_logs' }, () => {
          fetchStudents()
          fetchLogs(selectedDate)
        })
        .subscribe()

      return () => {
        supabase.removeChannel(channel)
      }
    }
  }, [isLoggedIn, selectedDate])

  const handleLogin = (e) => {
    e.preventDefault()
    if (selectedRoleOption === 'director' && passwordInput === '4507') {
      setUserRole('director')
      setIsLoggedIn(true)
    } else if (selectedRoleOption === 'english' && passwordInput === '0000') {
      setUserRole('english')
      setIsLoggedIn(true)
    } else if (selectedRoleOption === 'math' && passwordInput === '0926') {
      setUserRole('math')
      setIsLoggedIn(true)
    } else {
      alert('비밀번호가 올바르지 않습니다.')
    }
    setPasswordInput('')
  }

  const fetchStudents = async () => {
    const { data, error } = await supabase.from('students').select('*').order('name', { ascending: true })
    if (!error) setStudents(data || [])
  }

  const fetchLogs = async (date) => {
    const startOfDay = `${date}T00:00:00`
    const endOfDay = `${date}T23:59:59`
    const { data, error } = await supabase
      .from('attendance_logs')
      .select('*')
      .gte('timestamp', startOfDay)
      .lte('timestamp', endOfDay)
      .order('timestamp', { ascending: false })
    if (!error) setLogs(data || [])
  }

  const handleAddStudent = async (e) => {
    e.preventDefault()
    if (!newName.trim()) return

    const { error } = await supabase.from('students').insert([
      { name: newName.trim(), school: newSchool.trim(), grade: newGrade.trim(), parent_phone: newParentPhone.trim(), subjects: newSubjects, status: '미등원' }
    ])

    if (!error) {
      setNewName(''); setNewSchool(''); setNewGrade(''); setNewParentPhone(''); setNewSubjects('영어+수학');
      fetchStudents()
    }
  }

  const openEditModal = (student) => {
    setEditingStudent(student)
    setEditName(student.name || '')
    setEditSchool(student.school || '')
    setEditGrade(student.grade || '')
    setEditParentPhone(student.parent_phone || '')
    setEditSubjects(student.subjects || '영어+수학')
  }

  const handleUpdateStudent = async (e) => {
    e.preventDefault()
    if (!editingStudent) return
    const { error } = await supabase.from('students').update({
      name: editName.trim(), school: editSchool.trim(), grade: editGrade.trim(), parent_phone: editParentPhone.trim(), subjects: editSubjects
    }).eq('id', editingStudent.id)

    if (!error) {
      setEditingStudent(null)
      fetchStudents()
    }
  }

  const handleDeleteStudent = async (id, name) => {
    if (window.confirm(`${name} 학생을 삭제하시겠습니까?`)) {
      await supabase.from('students').delete().eq('id', id)
      fetchStudents()
    }
  }

  const handleCheckIn = async (student, subject) => {
    const now = new Date()
    const timeString = `${selectedDate}T${now.toTimeString().split(' ')[0]}`

    await supabase.from('attendance_logs').insert([{ student_id: student.id, type: '등원', subject: subject, timestamp: timeString }])
    await supabase.from('students').update({ status: '등원', current_subject: subject }).eq('id', student.id)
    fetchStudents(); fetchLogs(selectedDate)
  }

  const handleCheckOut = async (student) => {
    const now = new Date()
    const timeString = `${selectedDate}T${now.toTimeString().split(' ')[0]}`

    await supabase.from('attendance_logs').insert([{ student_id: student.id, type: '하원', subject: student.current_subject || '공통', timestamp: timeString }])
    await supabase.from('students').update({ status: '하원', current_subject: null }).eq('id', student.id)
    fetchStudents(); fetchLogs(selectedDate)
  }

  const handleLateCheckIn = async (student, minutesAgo) => {
    const now = new Date()
    now.setMinutes(now.getMinutes() - parseInt(minutesAgo))
    const timeString = `${selectedDate}T${now.toTimeString().split(' ')[0]}`

    const targetSubject = student.current_subject || (student.subjects?.includes('영어') ? '영어' : '수학')

    await supabase.from('attendance_logs').insert([{ student_id: student.id, type: '등원', subject: targetSubject, timestamp: timeString }])
    await supabase.from('students').update({ status: '등원', current_subject: targetSubject }).eq('id', student.id)
    fetchStudents(); fetchLogs(selectedDate)
  }

  const getStudentTodayStats = (studentId) => {
    const studentLogs = logs.filter(l => l.student_id === studentId).sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
    let engMin = 0
    let mathMin = 0
    let lastInTime = null
    let lastSubject = null

    for (let log of studentLogs) {
      if (log.type === '등원') {
        lastInTime = new Date(log.timestamp)
        lastSubject = log.subject
      } else if (log.type === '하원' && lastInTime) {
        const outTime = new Date(log.timestamp)
        const diffMin = Math.floor((outTime - lastInTime) / 60000)
        if (diffMin > 0) {
          if (lastSubject === '영어') engMin += diffMin
          if (lastSubject === '수학') mathMin += diffMin
        }
        lastInTime = null
      }
    }

    const targetStudent = students.find(s => s.id === studentId)
    if (targetStudent?.status === '등원' && lastInTime) {
      const diffMin = Math.floor((new Date() - lastInTime) / 60000)
      if (diffMin > 0) {
        if (targetStudent.current_subject === '영어') engMin += diffMin
        if (targetStudent.current_subject === '수학') mathMin += diffMin
      }
    }

    return { total: engMin + mathMin, eng: engMin, math: mathMin }
  }

  if (!isLoggedIn) {
    return (
      <div className="login-container">
        <div className="login-card">
          <h2>학원 출석 시스템 로그인</h2>
          <form onSubmit={handleLogin} className="login-form">
            <select value={selectedRoleOption} onChange={(e) => setSelectedRoleOption(e.target.value)}>
              <option value="director">👑 원장님</option>
              <option value="english">🔤 영어 선생님</option>
              <option value="math">📐 수학 선생님</option>
            </select>
            <input 
              type="password" 
              placeholder="비밀번호를 입력하세요" 
              value={passwordInput} 
              onChange={(e) => setPasswordInput(e.target.value)} 
              required 
            />
            <button type="submit" className="btn-primary" style={{ padding: '12px' }}>로그인</button>
          </form>
        </div>
      </div>
    )
  }

  const roleFilteredStudents = students.filter((student) => {
    const userSubjects = student.subjects || '영어+수학'
    let passRole = true
    if (userRole === 'english') passRole = userSubjects.includes('영어')
    if (userRole === 'math') passRole = userSubjects.includes('수학')

    const passSearch = student.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                       (student.school && student.school.toLowerCase().includes(searchTerm.toLowerCase()))
    return passRole && passSearch
  })

  const finalFilteredStudents = roleFilteredStudents.filter((student) => {
    if (activeTab === 'checkedIn') return student.status === '등원'
    if (activeTab === 'checkedOut') return student.status === '하원'
    if (activeTab === 'notCheckedIn') return !student.status || student.status === '미등원'
    return true
  })

  return (
    <div className="app-container">
      <header className="main-header">
        <h1>학원 출석 및 과목별 학습 시간 시스템 ({userRole === 'director' ? '원장님' : userRole === 'english' ? '영어 선생님' : '수학 선생님'})</h1>
        <div className="header-controls">
          <input type="date" className="date-picker" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} />
          <button onClick={() => setIsLoggedIn(false)} className="btn-logout">로그아웃</button>
        </div>
      </header>

      {userRole === 'director' && (
        <div className="card">
          <form onSubmit={handleAddStudent} className="add-student-form">
            <input type="text" placeholder="학생 이름" value={newName} onChange={(e) => setNewName(e.target.value)} required />
            <input type="text" placeholder="학교" value={newSchool} onChange={(e) => setNewSchool(e.target.value)} />
            <input type="text" placeholder="학년 (예: 초1)" value={newGrade} onChange={(e) => setNewGrade(e.target.value)} />
            <input type="text" placeholder="학부모 연락처" value={newParentPhone} onChange={(e) => setNewParentPhone(e.target.value)} />
            <select value={newSubjects} onChange={(e) => setNewSubjects(e.target.value)}>
              <option value="영어+수학">영어 + 수학</option>
              <option value="영어만">영어만</option>
              <option value="수학만">수학만</option>
            </select>
            <button type="submit" className="btn-primary">등록</button>
          </form>
        </div>
      )}

      <div className="filter-bar">
        <input type="text" placeholder="🔍 학생 이름 검색..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="search-input" />
        <div className="tab-buttons">
          <button className={`tab-btn ${activeTab === 'all' ? 'active' : ''}`} onClick={() => setActiveTab('all')}>전체 ({roleFilteredStudents.length})</button>
          <button className={`tab-btn ${activeTab === 'checkedIn' ? 'active' : ''}`} onClick={() => setActiveTab('checkedIn')}>등원 ({roleFilteredStudents.filter(s => s.status === '등원').length})</button>
          <button className={`tab-btn ${activeTab === 'checkedOut' ? 'active' : ''}`} onClick={() => setActiveTab('checkedOut')}>하원 ({roleFilteredStudents.filter(s => s.status === '하원').length})</button>
          <button className={`tab-btn ${activeTab === 'notCheckedIn' ? 'active' : ''}`} onClick={() => setActiveTab('notCheckedIn')}>미등원 ({roleFilteredStudents.filter(s => !s.status || s.status === '미등원').length})</button>
        </div>
      </div>

      <div className="student-grid">
        {finalFilteredStudents.length === 0 ? <p>해당되는 학생이 없습니다.</p> : finalFilteredStudents.map((student) => {
          const userSubjects = student.subjects || '영어+수학'
          const stats = getStudentTodayStats(student.id)

          return (
            <div key={student.id} className="student-card">
              <div className="student-card-top">
                <div className="student-info-left">
                  <span className="student-name">{student.name}</span>
                  <span className="student-badge">({student.school || '학교미입력'} {student.grade ? `/ ${student.grade}` : ''} / {userSubjects})</span>
                  <span className={`status-badge-inline ${student.status === '등원' ? 'in' : student.status === '하원' ? 'out' : 'none'}`}>
                    [{student.status === '등원' ? `등원 중: ${student.current_subject}` : student.status === '하원' ? '하원' : '미등원'}]
                  </span>
                </div>

                <div className="student-actions-right">
                  {(userRole === 'director' || userRole === 'english') && userSubjects.includes('영어') && (
                    <button onClick={() => handleCheckIn(student, '영어')} className={`action-btn ${student.current_subject === '영어' ? 'btn-eng-active' : ''}`}>등원(영)</button>
                  )}
                  {(userRole === 'director' || userRole === 'math') && userSubjects.includes('수학') && (
                    <button onClick={() => handleCheckIn(student, '수학')} className={`action-btn ${student.current_subject === '수학' ? 'btn-math-active' : ''}`}>등원(수)</button>
                  )}
                  <button onClick={() => handleCheckOut(student)} className="action-btn btn-checkout">하원</button>
                  
                  {userRole === 'director' && (
                    <>
                      <button onClick={() => openEditModal(student)} className="action-btn">수정</button>
                      <button onClick={() => handleDeleteStudent(student.id, student.name)} className="action-btn btn-delete">삭제</button>
                    </>
                  )}
                </div>
              </div>

              <div className="student-card-bottom">
                <div className="timer-info">
                  <span>⏱️ <strong>{student.status === '등원' ? `${student.current_subject} 진행중` : '학습 대기중'}</strong></span>
                  <select onChange={(e) => { if(e.target.value) { handleLateCheckIn(student, e.target.value); e.target.value = ""; }}} className="late-select" defaultValue="">
                    <option value="" disabled>⏰ 늦게 눌렀나요?</option>
                    <option value="10">10분 전 등원</option>
                    <option value="30">30분 전 등원</option>
                    <option value="60">1시간 전 등원</option>
                  </select>
                </div>
                <div className="total-time-info">
                  오늘 총: {stats.total}분 (영: {stats.eng}분 / 수: {stats.math}분)
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* 수정 모달 */}
      {editingStudent && (
        <div className="modal-backdrop">
          <div className="modal-card">
            <h3>✏️ 학생 정보 수정</h3>
            <form onSubmit={handleUpdateStudent}>
              <div className="form-group"><label>이름</label><input type="text" value={editName} onChange={(e) => setEditName(e.target.value)} required /></div>
              <div className="form-group"><label>학교</label><input type="text" value={editSchool} onChange={(e) => setEditSchool(e.target.value)} /></div>
              <div className="form-group"><label>학년</label><input type="text" value={editGrade} onChange={(e) => setEditGrade(e.target.value)} /></div>
              <div className="form-group"><label>학부모 연락처</label><input type="text" value={editParentPhone} onChange={(e) => setEditParentPhone(e.target.value)} /></div>
              <div className="form-group">
                <label>수강 과목</label>
                <select value={editSubjects} onChange={(e) => setEditSubjects(e.target.value)}>
                  <option value="영어+수학">영어 + 수학</option>
                  <option value="영어만">영어만</option>
                  <option value="수학만">수학만</option>
                </select>
              </div>
              <div className="modal-actions">
                <button type="submit" className="btn-primary">저장</button>
                <button type="button" className="btn-secondary" onClick={() => setEditingStudent(null)}>취소</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default App