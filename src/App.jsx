import React, { useState, useEffect } from 'react'
import { supabase } from './supabaseClient'
import './App.css'

function App() {
  const [students, setStudents] = useState([])
  const [logs, setLogs] = useState([])
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0])
  const [activeTab, setActiveTab] = useState('all') 
  const [userRole, setUserRole] = useState('director') 
  const [searchTerm, setSearchTerm] = useState('')

  // 등록 폼
  const [newName, setNewName] = useState('')
  const [newSchool, setNewSchool] = useState('')
  const [newGrade, setNewGrade] = useState('')
  const [newParentPhone, setNewParentPhone] = useState('')
  const [newSubjects, setNewSubjects] = useState('영어+수학')

  // 수정 폼
  const [editingStudent, setEditingStudent] = useState(null)
  const [editName, setEditName] = useState('')
  const [editSchool, setEditSchool] = useState('')
  const [editGrade, setEditGrade] = useState('')
  const [editParentPhone, setEditParentPhone] = useState('')
  const [editSubjects, setEditSubjects] = useState('영어+수학')

  useEffect(() => {
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
  }, [selectedDate])

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
      { name: newName.trim(), school: newSchool.trim(), grade: newGrade.trim(), parent_phone: newParentPhone.trim(), subjects: newSubjects }
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

  // ⏰ 시간 직접 수정 기능
  const handleTimeEdit = async (log) => {
    const currentTime = new Date(log.timestamp).toTimeString().substring(0, 5) 
    const newTimeInput = window.prompt('수정할 시간을 입력하세요 (예: 14:30)', currentTime)

    if (!newTimeInput || newTimeInput === currentTime) return

    const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/
    if (!timeRegex.test(newTimeInput)) {
      alert('올바른 시간 형식이 아닙니다. (예: 14:30)')
      return
    }

    const updatedTimestamp = `${selectedDate}T${newTimeInput}:00`
    await supabase.from('attendance_logs').update({ timestamp: updatedTimestamp }).eq('id', log.id)
    fetchLogs(selectedDate)
  }

  const roleFilteredStudents = students.filter((student) => {
    const userSubjects = student.subjects || '영어+수학'
    let passRole = true
    if (userRole === 'english') passRole = userSubjects.includes('영어')
    if (userRole === 'math') passRole = userSubjects.includes('수학') // "수학만" 완벽 호환

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
      <header className="header">
        <h1>관리자 관리 시스템</h1>
        <div className="header-controls">
          <label className="role-selector">
            <span>모드 선택: </span>
            <select value={userRole} onChange={(e) => setUserRole(e.target.value)}>
              <option value="director">👑 원장님 (전체)</option>
              <option value="english">🔤 영어 선생님</option>
              <option value="math">📐 수학 선생님</option>
            </select>
          </label>
          <input type="date" className="date-picker" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} />
        </div>
      </header>

      <main className="main-content">
        <section className="left-section">
          {userRole === 'director' && (
            <div className="card add-student-card">
              <h3>➕ 신규 학생 등록</h3>
              <form onSubmit={handleAddStudent} className="add-student-form">
                <input type="text" placeholder="이름 (필수)" value={newName} onChange={(e) => setNewName(e.target.value)} required />
                <input type="text" placeholder="학교" value={newSchool} onChange={(e) => setNewSchool(e.target.value)} />
                <input type="text" placeholder="학년" value={newGrade} onChange={(e) => setNewGrade(e.target.value)} />
                <input type="text" placeholder="학부모 연락처" value={newParentPhone} onChange={(e) => setNewParentPhone(e.target.value)} />
                <select value={newSubjects} onChange={(e) => setNewSubjects(e.target.value)}>
                  <option value="영어+수학">영어+수학</option>
                  <option value="영어만">영어만</option>
                  <option value="수학만">수학만</option>
                </select>
                <button type="submit" className="btn-primary">등록</button>
              </form>
            </div>
          )}

          <div className="filter-bar">
            <input type="text" placeholder="🔍 학생 이름 / 학교 검색..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="search-input" />
            <div className="tab-buttons">
              <button className={`tab-btn ${activeTab === 'all' ? 'active' : ''}`} onClick={() => setActiveTab('all')}>전체 ({roleFilteredStudents.length})</button>
              <button className={`tab-btn ${activeTab === 'checkedIn' ? 'active' : ''}`} onClick={() => setActiveTab('checkedIn')}>등원 중 ({roleFilteredStudents.filter(s => s.status === '등원').length})</button>
              <button className={`tab-btn ${activeTab === 'checkedOut' ? 'active' : ''}`} onClick={() => setActiveTab('checkedOut')}>하원 완료 ({roleFilteredStudents.filter(s => s.status === '하원').length})</button>
              <button className={`tab-btn ${activeTab === 'notCheckedIn' ? 'active' : ''}`} onClick={() => setActiveTab('notCheckedIn')}>미등원 ({roleFilteredStudents.filter(s => !s.status || s.status === '미등원').length})</button>
            </div>
          </div>

          <div className="student-grid">
            {finalFilteredStudents.length === 0 ? <p>해당되는 학생이 없습니다.</p> : finalFilteredStudents.map((student) => {
              const userSubjects = student.subjects || '영어+수학'

              return (
                <div key={student.id} className={`student-card ${student.status === '등원' ? 'status-in' : student.status === '하원' ? 'status-out' : ''}`}>
                  <div className="student-info">
                    <div className="student-header">
                      <span className="student-name">{student.name}</span>
                      <span className="student-badge">{userSubjects}</span>
                    </div>
                    <p className="student-sub">{student.school || '학교 미입력'} {student.grade ? `(${student.grade})` : ''}</p>
                    <p className="status-indicator">
                      상태: <strong>{student.status === '등원' ? `🟢 등원 중 (${student.current_subject || '과목미지정'})` : student.status === '하원' ? '🔴 하원 완료' : '🟣 미등원'}</strong>
                    </p>
                  </div>

                  <div className="student-actions">
                    {(userRole === 'director' || userRole === 'english') && userSubjects.includes('영어') && (
                      <button onClick={() => handleCheckIn(student, '영어')} className={`action-btn ${student.current_subject === '영어' ? 'btn-eng-active' : ''}`}>등원(영)</button>
                    )}
                    {(userRole === 'director' || userRole === 'math') && userSubjects.includes('수학') && (
                      <button onClick={() => handleCheckIn(student, '수학')} className={`action-btn ${student.current_subject === '수학' ? 'btn-math-active' : ''}`}>등원(수)</button>
                    )}
                    <button onClick={() => handleCheckOut(student)} className="action-btn btn-checkout" disabled={student.status !== '등원'}>하원</button>

                    {userRole === 'director' && (
                      <div className="admin-btn-group">
                        <button onClick={() => openEditModal(student)} className="btn-edit">수정</button>
                        <button onClick={() => handleDeleteStudent(student.id, student.name)} className="btn-delete">삭제</button>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </section>

        <section className="right-section">
          <div className="card log-card">
            <h3>📋 현재 기록 ({selectedDate})</h3>
            <div className="log-list">
              {logs.length === 0 ? <p style={{color: '#64748b'}}>기록이 없습니다.</p> : logs.map((log) => {
                const matchedStudent = students.find((s) => s.id === log.student_id)
                const time = new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })

                return (
                  <div key={log.id} className="log-item">
                    <span className="log-time">{time}</span>
                    <span className="log-student">{matchedStudent ? matchedStudent.name : '미상'}</span>
                    <span className={`log-badge ${log.type === '등원' ? 'badge-in' : 'badge-out'}`}>{log.type} ({log.subject})</span>
                    <button onClick={() => handleTimeEdit(log)} className="btn-time-edit" title="시간 직접 수정">✏️</button>
                  </div>
                )
              })}
            </div>
          </div>
        </section>
      </main>

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
                  <option value="영어+수학">영어+수학</option>
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