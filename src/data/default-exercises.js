module.exports = [
  ['บอดี้เวทสควอต', ['quadriceps', 'glutes'], 'squat', [], true, 'beginner'],
  ['โกเบล็ตสควอต', ['quadriceps', 'glutes'], 'squat', ['dumbbell'], false, 'beginner'],
  ['ลันจ์', ['quadriceps', 'glutes'], 'squat', [], true, 'beginner'],
  ['เดดลิฟต์', ['hamstrings', 'glutes', 'lower_back'], 'hinge', ['barbell'], false, 'intermediate'],
  ['ฮิปทรัสต์', ['glutes', 'hamstrings'], 'hinge', ['bench', 'barbell'], false, 'beginner'],
  ['วิดพื้น', ['chest', 'triceps', 'front_delts'], 'push', [], true, 'beginner'],
  ['เบนช์เพรส', ['chest', 'triceps'], 'push', ['barbell', 'bench'], false, 'intermediate'],
  ['ดัมเบลเชสต์เพรส', ['chest', 'triceps'], 'push', ['dumbbell', 'bench'], false, 'beginner'],
  ['โอเวอร์เฮดเพรส', ['shoulders', 'triceps'], 'push', ['dumbbell'], false, 'intermediate'],
  ['แลทพูลดาวน์', ['lats', 'biceps'], 'pull', ['cable'], false, 'beginner'],
  ['ซีทเต็ดเคเบิลโรว์', ['upper_back', 'lats', 'biceps'], 'pull', ['cable'], false, 'beginner'],
  ['ดัมเบลโรว์', ['lats', 'upper_back', 'biceps'], 'pull', ['dumbbell'], false, 'beginner'],
  ['พูลอัป', ['lats', 'biceps'], 'pull', ['pullup_bar'], true, 'intermediate'],
  ['ไบเซปเคิร์ล', ['biceps'], 'isolation', ['dumbbell'], false, 'beginner'],
  ['ไทรเซปพุชดาวน์', ['triceps'], 'isolation', ['cable'], false, 'beginner'],
  ['แพลงก์', ['abs', 'core'], 'core', [], true, 'beginner'],
  ['ครันช์', ['abs'], 'core', [], true, 'beginner'],
  ['วิ่ง', ['legs'], 'cardio', ['treadmill'], false, 'beginner'],
  ['เดินเร็ว', ['legs'], 'cardio', ['treadmill'], false, 'beginner'],
  ['ปั่นจักรยาน', ['legs'], 'cardio', ['stationary_bike'], false, 'beginner'],
].map(([name, primary_muscles, movement_pattern, equipment, is_bodyweight, difficulty]) => ({
  name, language: 'th', primary_muscles, muscle_groups: primary_muscles,
  movement_pattern, equipment, is_bodyweight, difficulty, visibility: 'global',
  execution_notes: 'รักษาท่าทางให้มั่นคงและเคลื่อนไหวด้วยการควบคุม',
  metrics_supported: movement_pattern === 'cardio'
    ? { reps: false, weight: false, time: true, distance: true, rpe: true }
    : { reps: true, weight: true, time: false, distance: false, rpe: true },
}));
