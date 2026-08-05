import React, { useState, useEffect } from 'react'
import { supabase } from './supabaseClient'
import './App.css'

function App() {
  const [students, setStudents] = useState([])
  const [logs, setLogs] = useState([])
  const [selectedDate, setSelectedDate] = useState(
    new Date().toISOString().split('T')[0]
  )
  const [activeTab, setActiveTab] = useState('all') // 'all', 'checkedIn', 'checkedOut', 'notCheckedIn'
  const [userRole, setUserRole] = useState('director') // 'director', 'english', 'math'
  const [searchTerm, setSearchTerm] = useState('')

  // 신규 학생 등록 Form State
  const [newName, setNewName] = useState('')
  const [newSchool, setNewSchool] = useState('')
  const [newGrade, setNewGrade] = useState('')
  const [newParentPhone, setNewParentPhone] = useState('')
  const [newSubjects, setNewSubjects] = useState('영어+수학')

  // 학생 정보 수정 Modal State
  const [editingStudent, setEditingStudent] = useState(null)
  const [editName, setEditName] = useState('')
  const [editSchool, setEditSchool] = useState('')
  const [editGrade, setEditGrade] = useState('')
  const [editParentPhone, setEditParentPhone] = useState('')
  const [editSubjects, setEditSubjects] = useState('영어+수학')

  // 초기 데이터 로드 및 Realtime 구독
  useEffect(() => {
    fetchStudents()
    fetchLogs(selectedDate)

    const channel = supabase
      .channel('attendance-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'attendance_logs' },
        () => {
          fetchStudents()
          fetchLogs(selectedDate)
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [selectedDate])

  // 학생 목록 불러오기
  const fetchStudents = async () => {
    const { data, error } = await supabase
      .from('students')
      .select('*')
      .order('name', { ascending: true })

    if (error) {
      console.error('Error fetching students:', error)
    } else {
      setStudents(data || [])
    }
  }

  // 로그 불러오기 및 학생 current_status 파악
  const fetchLogs = async (date) => {
    const startOfDay = `${date}T00:00:00`
    const endOfDay = `${date}T23:59:59`

    const { data, error } = await supabase
      .from('attendance_logs')
      .select('*')
      .gte('timestamp', startOfDay)
      .lte('timestamp', endOfDay)
      .order('timestamp', { ascending: false })

    if (error) {
      console.error('Error fetching logs:', error)
    } else {
      setLogs(data || [])
    }
  }

  // 신규 학생 등록
  const handleAddStudent = async (e) => {
    e.preventDefault()
    if (!newName.trim()) return

    const { error } = await supabase.from('students').insert([
      {
        name: newName.trim(),
        school: newSchool.trim(),
        grade: newGrade.trim(),
        parent_phone: newParentPhone.trim(),
        subjects: newSubjects
      }
    ])

    if (error) {
      alert('학생 등록 실패: ' + error.message)
    } else {
      setNewName('')
      setNewSchool('')
      setNewGrade('')
      setNewParentPhone('')
      setNewSubjects('영어+수학')
      fetchStudents()
    }
  }

  // 학생 정보 수정 모달 열기
  const openEditModal = (student) => {
    setEditingStudent(student)
    setEditName(student.name || '')
    setEditSchool(student.school || '')
    setEditGrade(student.grade || '')
    setEditParentPhone(student.parent_phone || '')
    setEditSubjects(student.subjects || '영어+수학')
  }

  // 학생 정보 수정 저장
  const handleUpdateStudent = async (e) => {
    e.preventDefault()
    if (!editingStudent) return

    const { error } = await supabase
      .from('students')
      .update({
        name: editName.trim(),
        school: editSchool.trim(),
        grade: editGrade.trim(),
        parent_phone: editParentPhone.trim(),
        subjects: editSubjects
      })
      .eq('id', editingStudent.id)

    if (error) {
      alert('학생 정보 수정 실패: ' + error.message)
    } else {
      setEditingStudent(null)
      fetchStudents()
    }
  }

  // 학생 삭제
  const handleDeleteStudent = async (id, name) => {
    if (window.confirm(`${name} 학생을 정말 삭제하시겠습니까?`)) {
      const { error } = await supabase.from('students').delete().eq('id', id)
      if (error) {
        alert('삭제 실패: ' + error.message)
      } else {
        fetchStudents()
      }
    }
  }

  // 등원 처리
  const handleCheckIn = async (student, subject) => {
    const now = new Date()
    const timeString = `${selectedDate}T${now.toTimeString().split(' ')[0]}`

    const { error } = await supabase.from('attendance_logs').insert([
      {
        student_id: student.id,
        type: '등원',
        subject: subject,
        timestamp: timeString
      }
    ])

    if (error) {
      alert('등원 처리 실패: ' + error.message)
    } else {
      await supabase
        .from('students')
        .update({
          status: '등원',
          current_subject: subject
        })
        .eq('id', student.id)

      fetchStudents()
      fetchLogs(selectedDate)
    }
  }

  // 하원 처리
  const handleCheckOut = async (student) => {
    const now = new Date()
    const timeString = `${selectedDate}T${now.toTimeString().split(' ')[0]}`

    const { error } = await supabase.from('attendance_logs').insert([
      {
        student_id: student.id,
        type: '하원',
        subject: student.current_subject || '공통',
        timestamp: timeString
      }
    ])

    if (error) {
      alert('하원 처리 실패: ' + error.message)
    } else {
      await supabase
        .from('students')
        .update({
          status: '하원',
          current_subject: null
        })
        .eq('id', student.id)

      fetchStudents()
      fetchLogs(selectedDate)
    }
  }

  // ⏰ 시간 직접 수정 기능
  const handleTimeEdit = async (log) => {
    const currentTime = new Date(log.timestamp).toTimeString().substring(0, 5) // HH:MM
    const newTimeInput = window.prompt('수정할 시간을 입력하세요 (HH:MM 예: 14:30)', currentTime)

    if (!newTimeInput || newTimeInput === currentTime) return

    // 시간 형식 검증 (HH:MM)
    const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/
    if (!timeRegex.test(newTimeInput)) {
      alert('올바른 시간 형식이 아닙니다. (예: 14:30)')
      return
    }

    const updatedTimestamp = `${selectedDate}T${newTimeInput}:00`

    const { error } = await supabase
      .from('attendance_logs')
      .update({ timestamp: updatedTimestamp })
      .eq('id', log.id)

    if (error) {
      alert('시간 수정 실패: ' + error.message)
    } else {
      fetchLogs(selectedDate)
    }
  }

  // 과목 및 검색어 필터링
  const roleFilteredStudents = students.filter((student) => {
    const userSubjects = student.subjects || '영어+수학'
    
    // role 조건
    let passRole = true
    if (userRole === 'english') {
      passRole = userSubjects.includes('영어')
    } else if (userRole === 'math') {
      passRole = userSubjects.includes('수학')
    }

    // 검색어 조건
    const passSearch =
      student.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (student.school && student.school.toLowerCase().includes(searchTerm.toLowerCase()))

    return passRole && passSearch
  })

  // 탭 상태 필터링
  const finalFilteredStudents = roleFilteredStudents.filter((student) => {
    if (activeTab === 'checkedIn') return student.status === '등원'
    if (activeTab === 'checkedOut') return student.status === '하원'
    if (activeTab === 'notCheckedIn') return !student.status || student.status === '미등원'
    return true
  })

  return (
    <div className="app-container">
      {/* 상단 헤더 */}
      <header className="header">
        <h1>📚 출석 관리 시스템</h1>
        <div className="header-controls">
          <label className="role-selector">
            <span>모드 선택: </span>
            <select value={userRole} onChange={(e) => setUserRole(e.target.value)}>
              <option value="director">👑 원장님 (전체)</option>
              <option value="english">🔤 영어 선생님</option>
              <option value="math">📐 수학 선생님</option>
            </select>
          </label>
          <input
            type="date"
            className="date-picker"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
          />
        </div>
      </header>

      <main className="main-content">
        {/* 왼쪽 섹션: 학생 목록 및 관리 */}
        <section className="left-section">
          {/* 학생 등록 (원장님 모드 전용) */}
          {userRole === 'director' && (
            <div className="card add-student-card">
              <h3>➕ 신규 학생 등록</h3>
              <form onSubmit={handleAddStudent} className="add-student-form">
                <input
                  type="text"
                  placeholder="이름 (필수)"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  required
                />
                <input
                  type="text"
                  placeholder="학교"
                  value={newSchool}
                  onChange={(e) => setNewSchool(e.target.value)}
                />
                <input
                  type="text"
                  placeholder="학년"
                  value={newGrade}
                  onChange={(e) => setNewGrade(e.target.value)}
                />
                <input
                  type="text"
                  placeholder="학부모 연락처"
                  value={newParentPhone}
                  onChange={(e) => setNewParentPhone(e.target.value)}
                />
                <select value={newSubjects} onChange={(e) => setNewSubjects(e.target.value)}>
                  <option value="영어+수학">영어+수학</option>
                  <option value="영어만">영어만</option>
                  <option value="수학만">수학만</option>
                </select>
                <button type="submit" className="btn-primary">등록</button>
              </form>
            </div>
          )}

          {/* 검색 및 필터 탭 */}
          <div className="filter-bar">
            <input
              type="text"
              placeholder="🔍 학생 이름 / 학교 검색..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="search-input"
            />
            <div className="tab-buttons">
              <button
                className={`tab-btn ${activeTab === 'all' ? 'active' : ''}`}
                onClick={() => setActiveTab('all')}
              >
                전체 ({roleFilteredStudents.length})
              </button>
              <button
                className={`tab-btn ${activeTab === 'checkedIn' ? 'active' : ''}`}
                onClick={() => setActiveTab('checkedIn')}
              >
                등원 중 ({roleFilteredStudents.filter((s) => s.status === '등원').length})
              </button>
              <button
                className={`tab-btn ${activeTab === 'checkedOut' ? 'active' : ''}`}
                onClick={() => setActiveTab('checkedOut')}
              >
                하원 완료 ({roleFilteredStudents.filter((s) => s.status === '하원').length})
              </button>
              <button
                className={`tab-btn ${activeTab === 'notCheckedIn' ? 'active' : ''}`}
                onClick={() => setActiveTab('notCheckedIn')}
              >
                미등원 ({roleFilteredStudents.filter((s) => !s.status || s.status === '미등원').length})
              </button>
            </div>
          </div>

          {/* 학생 카드 리스트 */}
          <div className="student-grid">
            {finalFilteredStudents.length === 0 ? (
              <p className="no-data">해당되는 학생이 없습니다.</p>
            ) : (
              finalFilteredStudents.map((student) => {
                const userSubjects = student.subjects || '영어+수학'

                return (
                  <div
                    key={student.id}
                    className={`student-card ${
                      student.status === '등원'
                        ? 'status-in'
                        : student.status === '하원'
                        ? 'status-out'
                        : ''
                    }`}
                  >
                    <div className="student-info">
                      <div className="student-header">
                        <span className="student-name">{student.name}</span>
                        <span className="student-badge">{userSubjects}</span>
                      </div>
                      <p className="student-sub">
                        {student.school || '학교 미입력'} {student.grade ? `(${student.grade})` : ''}
                      </p>
                      {student.parent_phone && (
                        <p className="student-phone">📞 {student.parent_phone}</p>
                      )}
                      <p className="status-indicator">
                        상태:{' '}
                        <strong>
                          {student.status === '등원'
                            ? `🟢 등원 중 (${student.current_subject || '과목미지정'})`
                            : student.status === '하원'
                            ? '🔴 하원 완료'
                            : '⚪ 미등원'}
                        </strong>
                      </p>
                    </div>

                    <div className="student-actions">
                      {/* 영어 등원 버튼 */}
                      {(userRole === 'director' || userRole === 'english') &&
                        userSubjects.includes('영어') && (
                          <button
                            onClick={() => handleCheckIn(student, '영어')}
                            className={`action-btn ${
                              student.current_subject === '영어' ? 'btn-eng-active' : 'btn-default'
                            }`}
                          >
                            등원(영)
                          </button>
                        )}

                      {/* 수학 등원 버튼 */}
                      {(userRole === 'director' || userRole === 'math') &&
                        userSubjects.includes('수학') && (
                          <button
                            onClick={() => handleCheckIn(student, '수학')}
                            className={`action-btn ${
                              student.current_subject === '수학' ? 'btn-math-active' : 'btn-default'
                            }`}
                          >
                            등원(수)
                          </button>
                        )}

                      {/* 하원 버튼 */}
                      <button
                        onClick={() => handleCheckOut(student)}
                        className="action-btn btn-checkout"
                        disabled={student.status !== '등원'}
                      >
                        하원
                      </button>

                      {/* 수정/삭제 (원장님 전용) */}
                      {userRole === 'director' && (
                        <div className="admin-btn-group">
                          <button
                            onClick={() => openEditModal(student)}
                            className="btn-edit"
                          >
                            수정
                          </button>
                          <button
                            onClick={() => handleDeleteStudent(student.id, student.name)}
                            className="btn-delete"
                          >
                            삭제
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </section>

        {/* 오른쪽 섹션: 실시간 출석 로그 */}
        <section className="right-section">
          <div className="card log-card">
            <h3>📋 실시간 출석 기록 ({selectedDate})</h3>
            <div className="log-list">
              {logs.length === 0 ? (
                <p className="no-data">출석 기록이 없습니다.</p>
              ) : (
                logs.map((log) => {
                  const matchedStudent = students.find((s) => s.id === log.student_id)
                  const time = new Date(log.timestamp).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: false
                  })

                  return (
                    <div key={log.id} className="log-item">
                      <span className="log-time">{time}</span>
                      <span className="log-student">
                        {matchedStudent ? matchedStudent.name : '미상'}
                      </span>
                      <span
                        className={`log-badge ${
                          log.type === '등원' ? 'badge-in' : 'badge-out'
                        }`}
                      >
                        {log.type} ({log.subject})
                      </span>
                      {/* ✏️ 시간 수정 버튼 */}
                      <button
                        onClick={() => handleTimeEdit(log)}
                        className="btn-time-edit"
                        title="시간 직접 수정"
                      >
                        ✏️
                      </button>
                    </div>
                  )
                })
              )}
            </div>
          </div>
        </section>
      </main>

      {/* 학생 정보 수정 모달 */}
      {editingStudent && (
        <div className="modal-backdrop">
          <div className="modal-card">
            <h3>✏️ 학생 정보 수정</h3>
            <form onSubmit={handleUpdateStudent}>
              <div className="form-group">
                <label>이름</label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <label>학교</label>
                <input
                  type="text"
                  value={editSchool}
                  onChange={(e) => setEditSchool(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label>학년</label>
                <input
                  type="text"
                  value={editGrade}
                  onChange={(e) => setEditGrade(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label>학부모 연락처</label>
                <input
                  type="text"
                  value={editParentPhone}
                  onChange={(e) => setEditParentPhone(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label>수강 과목</label>
                <select
                  value={editSubjects}
                  onChange={(e) => setEditSubjects(e.target.value)}
                >
                  <option value="영어+수학">영어+수학</option>
                  <option value="영어만">영어만</option>
                  <option value="수학만">수학만</option>
                </select>
              </div>
              <div className="modal-actions">
                <button type="submit" className="btn-primary">저장</button>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setEditingStudent(null)}
                >
                  취소
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default App