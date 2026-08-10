import React, { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';

// Supabase 클라이언트 설정 (환경에 맞게 수정하여 사용하세요)
const supabaseUrl = 'YOUR_SUPABASE_URL';
const supabaseKey = 'YOUR_SUPABASE_ANON_KEY';
const supabase = createClient(supabaseUrl, supabaseKey);

export default function AcademyAttendanceSystem() {
  const [userRole, setUserRole] = useState('teacher'); // 'director' (원장) 또는 'teacher' (선생님)
  const [activeTab, setActiveTab] = useState('attendance'); // 'attendance', 'calendar', 'materials', 'storage'
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);

  // 오늘 날짜 구하기 (YYYY-MM-DD 형식)
  const getTodayDate = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const today = getTodayDate();

  // 학생 데이터 및 출석 상태 불러오기
  const fetchStudents = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.from('students').select('*');
      if (error) throw error;

      // 핵심 수정 부분: 자정이 지났을 때 하원 안 한 학생 처리
      const processedData = data.map((student) => {
        // 마지막 출석 날짜가 오늘보다 이전이고, 상태가 하원이 아닌 경우 (즉, 등원 상태로 날이 바뀐 경우)
        if (student.last_attendance_date && student.last_attendance_date < today) {
          if (student.status !== '미등원' && student.status !== '하원') {
            return {
              ...student,
              status: '미등원',
              // 필요에 따라 타이머 초기화 등 추가 가능
            };
          }
        }
        return student;
      });

      setStudents(processedData);
    } catch (err) {
      console.error('데이터를 불러오는 중 오류가 발생했습니다:', err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStudents();
  }, []);

  // 출석 상태 변경 함수 (등원 영어, 등원 수학, 미등원, 하원)
  const handleStatusChange = async (studentId, newStatus) => {
    const updateData = {
      status: newStatus,
      last_attendance_date: today, // 상태를 바꿀 때의 날짜 기록
    };

    try {
      const { error } = await supabase
        .from('students')
        .update(updateData)
        .eq('id', studentId);

      if (error) throw error;

      // 로컬 상태 업데이트
      setStudents(
        students.map((stu) =>
          stu.id === studentId ? { ...stu, ...updateData } : stu
        )
      );
    } catch (err) {
      console.error('상태 변경 실패:', err.message);
      alert('상태 변경에 실패했습니다.');
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto bg-gray-50 min-h-screen">
      <header className="flex justify-between items-center mb-6 bg-white p-4 rounded-lg shadow-sm">
        <h1 className="text-2xl font-bold text-gray-800">학원 출석 및 학습 시간 관리 시스템</h1>
        <div className="flex gap-2">
          <button
            onClick={() => setUserRole(userRole === 'director' ? 'teacher' : 'director')}
            className="px-4 py-2 bg-indigo-600 text-white rounded-md text-sm font-medium hover:bg-indigo-700 transition"
          >
            현재 모드: {userRole === 'director' ? '원장님 모드' : '선생님 모드'}
          </button>
        </div>
      </header>

      {/* 네비게이션 탭 */}
      <nav className="flex gap-4 mb-6 border-b pb-2">
        <button
          onClick={() => setActiveTab('attendance')}
          className={`pb-2 font-semibold text-sm ${
            activeTab === 'attendance'
              ? 'border-b-2 border-indigo-600 text-indigo-600'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          출석 관리
        </button>
        <button
          onClick={() => setActiveTab('calendar')}
          className={`pb-2 font-semibold text-sm ${
            activeTab === 'calendar'
              ? 'border-b-2 border-indigo-600 text-indigo-600'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          캘린더 기록
        </button>
        <button
          onClick={() => setActiveTab('materials')}
          className={`pb-2 font-semibold text-sm ${
            activeTab === 'materials'
              ? 'border-b-2 border-indigo-600 text-indigo-600'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          자료 및 문제지 관리
        </button>
        <button
          onClick={() => setActiveTab('storage')}
          className={`pb-2 font-semibold text-sm ${
            activeTab === 'storage'
              ? 'border-b-2 border-indigo-600 text-indigo-600'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          저장소 관리
        </button>
      </nav>

      {/* 탭 내용 영역 */}
      <main className="bg-white p-6 rounded-lg shadow-sm">
        {activeTab === 'attendance' && (
          <div>
            <h2 className="text-lg font-semibold mb-4 text-gray-700">실시간 학생 출석부 ({today})</h2>
            {loading ? (
              <p className="text-gray-500">불러오는 중...</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b bg-gray-100 text-gray-600 text-sm">
                      <th className="p-3">학생 이름</th>
                      <th className="p-3">현재 상태</th>
                      <th className="p-3">상태 변경</th>
                    </tr>
                  </thead>
                  <tbody>
                    {students.map((student) => (
                      <tr key={student.id} className="border-b hover:bg-gray-50 text-sm">
                        <td className="p-3 font-medium text-gray-800">{student.name}</td>
                        <td className="p-3">
                          <span
                            className={`px-2 py-1 rounded text-xs font-semibold ${
                              student.status === '등원(영어)' || student.status === '등원(수학)'
                                ? 'bg-green-100 text-green-700'
                                : student.status === '하원'
                                ? 'bg-gray-200 text-gray-700'
                                : 'bg-red-100 text-red-700'
                            }`}
                          >
                            {student.status || '미등원'}
                          </span>
                        </td>
                        <td className="p-3 flex gap-2">
                          <button
                            onClick={() => handleStatusChange(student.id, '등원(영어)')}
                            className="px-2.5 py-1 bg-blue-500 text-white rounded text-xs hover:bg-blue-600"
                          >
                            등원(영어)
                          </button>
                          <button
                            onClick={() => handleStatusChange(student.id, '등원(수학)')}
                            className="px-2.5 py-1 bg-emerald-500 text-white rounded text-xs hover:bg-emerald-600"
                          >
                            등원(수학)
                          </button>
                          <button
                            onClick={() => handleStatusChange(student.id, '하원')}
                            className="px-2.5 py-1 bg-amber-500 text-white rounded text-xs hover:bg-amber-600"
                          >
                            하원
                          </button>
                          <button
                            onClick={() => handleStatusChange(student.id, '미등원')}
                            className="px-2.5 py-1 bg-gray-400 text-white rounded text-xs hover:bg-gray-500"
                          >
                            미등원
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {activeTab === 'calendar' && (
          <div>
            <h2 className="text-lg font-semibold mb-4 text-gray-700">캘린더 출석 및 학습 기록</h2>
            <p className="text-gray-500 text-sm">캘린더 화면 영역입니다.</p>
          </div>
        )}

        {activeTab === 'materials' && (
          <div>
            <h2 className="text-lg font-semibold mb-4 text-gray-700">문제지 및 학습 자료 관리</h2>
            <p className="text-gray-500 text-sm">자료 목록 생성 및 저장 기능 영역입니다.</p>
          </div>
        )}

        {activeTab === 'storage' && (
          <div>
            <h2 className="text-lg font-semibold mb-4 text-gray-700">저장소 용량 관리 및 삭제</h2>
            <p className="text-gray-500 text-sm">용량 관리 및 직접 삭제 영역입니다.</p>
          </div>
        )}
      </main>
    </div>
  );
}