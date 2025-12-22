// Legacy hook file not used by the app anymore.
// Keep minimal exports to avoid TypeScript errors if imported accidentally.
export function useAttendanceSystem() {
  return {
    registerTeacher: async () => { throw new Error('useAttendanceSystem removed. Use page-level actions instead.'); },
    createClass: async () => { throw new Error('useAttendanceSystem removed. Use page-level actions instead.'); },
    updateAttendanceCode: async () => { throw new Error('useAttendanceSystem removed. Use page-level actions instead.'); },
    markAttendance: async () => { throw new Error('useAttendanceSystem removed. Use page-level actions instead.'); },
    isPending: false,
    error: undefined as any,
  };
}

export function useAttendanceSystemRead() {
  return {
    isTeacher: undefined,
    getClassDetails: () => undefined as any,
    hasAttended: () => undefined as any,
    getTeacherClasses: () => undefined as any,
    getStudentClasses: () => undefined as any,
  };
}
