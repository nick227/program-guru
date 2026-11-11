export const METRIC_DEFINITIONS = [
  { key: 'completion', label: 'Completed', valueType: 'BOOLEAN' as const, unit: null, precision: null, aggregation: 'COUNT' as const, betterDirection: 'HIGHER' as const, validation: null },
  { key: 'repetitions', label: 'Reps', valueType: 'INTEGER' as const, unit: 'reps', precision: null, aggregation: 'SUM' as const, betterDirection: 'HIGHER' as const, validation: { min: 0 } },
  { key: 'sets', label: 'Sets', valueType: 'INTEGER' as const, unit: 'sets', precision: null, aggregation: 'SUM' as const, betterDirection: 'HIGHER' as const, validation: { min: 0 } },
  { key: 'duration', label: 'Duration', valueType: 'DURATION' as const, unit: 's', precision: null, aggregation: 'SUM' as const, betterDirection: 'HIGHER' as const, validation: { min: 0 } },
  { key: 'distance', label: 'Distance', valueType: 'DECIMAL' as const, unit: 'km', precision: 2, aggregation: 'SUM' as const, betterDirection: 'HIGHER' as const, validation: { min: 0 } },
  { key: 'weight', label: 'Weight', valueType: 'DECIMAL' as const, unit: 'kg', precision: 1, aggregation: 'MAX' as const, betterDirection: 'HIGHER' as const, validation: { min: 0 } },
  { key: 'contribution_amount', label: 'Amount', valueType: 'DECIMAL' as const, unit: 'USD', precision: 2, aggregation: 'SUM' as const, betterDirection: 'HIGHER' as const, validation: { min: 0 } },
  { key: 'lesson_count', label: 'Lessons', valueType: 'INTEGER' as const, unit: 'lessons', precision: null, aggregation: 'SUM' as const, betterDirection: 'HIGHER' as const, validation: { min: 0 } },
  { key: 'pages', label: 'Pages', valueType: 'INTEGER' as const, unit: 'pages', precision: null, aggregation: 'SUM' as const, betterDirection: 'HIGHER' as const, validation: { min: 0 } },
  { key: 'rating', label: 'Rating', valueType: 'INTEGER' as const, unit: null, precision: null, aggregation: 'AVERAGE' as const, betterDirection: 'NONE' as const, validation: { min: 1, max: 5 } },
  { key: 'notes', label: 'Notes', valueType: 'TEXT' as const, unit: null, precision: null, aggregation: 'LAST' as const, betterDirection: 'NONE' as const, validation: null },
] as const

export const TOOL_DEFINITIONS = [
  { key: 'TIMER' as const, label: 'Timer', componentKey: 'timer', defaultConfig: { seconds: 60 } },
  { key: 'COUNTER' as const, label: 'Counter', componentKey: 'counter', defaultConfig: { step: 1 } },
  { key: 'CHECKLIST' as const, label: 'Checklist', componentKey: 'checklist', defaultConfig: {} },
  { key: 'NOTES' as const, label: 'Notes', componentKey: 'notes', defaultConfig: {} },
  { key: 'CALCULATOR' as const, label: 'Calculator', componentKey: 'calculator', defaultConfig: {} },
  { key: 'MEDIA_CAPTURE' as const, label: 'Media Capture', componentKey: 'media-capture', defaultConfig: {} },
] as const

export const ACHIEVEMENT_DEFINITIONS = [
  { key: 'first-completion', label: 'First step', description: 'Completed your first activity', icon: 'sparkles', ruleKind: 'TOTAL_COMPLETIONS' as const, threshold: 1, position: 0 },
  { key: 'ten-completions', label: 'Ten done', description: 'Completed 10 activities', icon: 'medal', ruleKind: 'TOTAL_COMPLETIONS' as const, threshold: 10, position: 1 },
  { key: 'fifty-completions', label: 'Fifty strong', description: 'Completed 50 activities', icon: 'flame', ruleKind: 'TOTAL_COMPLETIONS' as const, threshold: 50, position: 2 },
  { key: 'hundred-completions', label: 'Century club', description: 'Completed 100 activities', icon: 'crown', ruleKind: 'TOTAL_COMPLETIONS' as const, threshold: 100, position: 3 },
  { key: 'program-first-week', label: 'First week done', description: 'Completed the first week of a program', icon: 'calendar-check', ruleKind: 'PROGRAM_FIRST_WEEK' as const, threshold: null, position: 4 },
  { key: 'program-halfway', label: 'Halfway there', description: 'Reached the halfway mark in a program', icon: 'compass', ruleKind: 'PROGRAM_HALFWAY' as const, threshold: null, position: 5 },
  { key: 'program-completed', label: 'Program complete', description: 'Finished every scheduled activity in a program', icon: 'trophy', ruleKind: 'PROGRAM_COMPLETED' as const, threshold: null, position: 6 },
] as const

