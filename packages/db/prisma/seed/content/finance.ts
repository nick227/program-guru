import type { ActivityContent, ProgramContent } from '@project/shared'

export const FINANCE_ACTIVITIES: ActivityContent[] = [
  {
    slug: 'savings-contribution',
    title: 'Savings Contribution',
    summary: 'Move a planned transfer into your emergency fund or dedicated savings goal.',
    categorySlug: 'finance',
    focusSlugs: ['emergency-fund', 'fundamentals'],
    durationMinutes: 10,
    targetTime: '19:00',
    frequency: { kind: 'N_PER_WEEK', n: 1 },
    instructions: [
      { title: 'Execute your planned transfer', body: 'Transfer your scheduled amount into your dedicated high-yield savings or emergency account.' },
      { title: 'Log the contribution', body: 'Record the exact amount saved and note your updated milestone balance.' },
    ],
    metrics: [
      { key: 'contribution_amount', target: 50, required: true },
      { key: 'notes' },
    ],
    tools: [{ key: 'CALCULATOR' }, { key: 'NOTES' }],
  },
  {
    slug: 'weekly-budget-review',
    title: 'Weekly Budget Review',
    summary: 'Focused 15-minute check-in comparing the past seven days of spending with your plan.',
    categorySlug: 'finance',
    focusSlugs: ['spending-review', 'fundamentals'],
    durationMinutes: 15,
    targetTime: '19:00',
    frequency: { kind: 'N_PER_WEEK', n: 1 },
    instructions: [
      { title: 'Scan the past 7 days', body: 'Review checking and card transactions from the past week for any surprises or duplicate charges.' },
      { title: 'Rebalance next week', body: 'Identify any category running warm and adjust your discretionary cap for the upcoming week.' },
    ],
    metrics: [
      { key: 'completion', target: true, required: true },
      { key: 'duration', target: 900 },
      { key: 'notes' },
    ],
    tools: [{ key: 'CALCULATOR' }, { key: 'CHECKLIST' }, { key: 'NOTES' }],
  },
  {
    slug: 'categorize-expenses',
    title: 'Categorize Expenses',
    summary: 'Sort recent transactions into essentials, commitments, and discretionary spending.',
    categorySlug: 'finance',
    focusSlugs: ['spending-review', 'fundamentals'],
    durationMinutes: 10,
    targetTime: '19:00',
    frequency: { kind: 'N_PER_WEEK', n: 1 },
    instructions: [
      { title: 'Classify uncategorized items', body: 'Assign every recent purchase to housing, groceries, transport, utilities, or discretionary.' },
      { title: 'Spot one recurring pattern', body: 'Write down one small impulse or convenience spend you can simplify next week.' },
    ],
    metrics: [
      { key: 'completion', target: true, required: true },
      { key: 'notes' },
    ],
    tools: [{ key: 'CALCULATOR' }, { key: 'NOTES' }],
  },
  {
    slug: 'review-subscriptions',
    title: 'Review Subscriptions',
    summary: 'Audit recurring monthly and annual charges and trim anything unused.',
    categorySlug: 'finance',
    focusSlugs: ['spending-review'],
    durationMinutes: 15,
    targetTime: '19:00',
    frequency: { kind: 'N_PER_WEEK', n: 1 },
    instructions: [
      { title: 'List every recurring charge', body: 'Scan bank and card statements for memberships, software, and streaming renewals.' },
      { title: 'Keep, downgrade, or cancel', body: 'Cancel or pause at least one subscription you have not genuinely used in the past 30 days.' },
    ],
    metrics: [
      { key: 'completion', target: true, required: true },
      { key: 'notes' },
    ],
    tools: [{ key: 'CHECKLIST' }, { key: 'NOTES' }],
  },
]

export const FINANCE_PROGRAMS: ProgramContent[] = [
  {
    slug: 'starter-weekly-savings-budget',
    title: 'Weekly Savings & Budget Routine',
    description: 'A calm, practical 4-week money rhythm alternating savings transfers, expense categorization, and subscription audits.',
    categorySlug: 'finance',
    programTypeSlug: 'savings-plan',
    focusSlug: 'emergency-fund',
    level: 'BEGINNER',
    sessionMinutes: 15,
    tagSlugs: ['at-home', 'quick-win', 'pen-and-paper'],
    durationDays: 28,
    frequency: { kind: 'N_PER_WEEK', n: 2 },
    generationMode: 'ROTATE',
    visibility: 'PUBLIC',
    activitySlugs: ['savings-contribution', 'weekly-budget-review', 'categorize-expenses', 'review-subscriptions'],
    placements: [1, 4, 8, 11, 15, 18, 22, 25].map((day, idx) => ({
      relativeDay: day,
      activitySlug: ['savings-contribution', 'weekly-budget-review', 'categorize-expenses', 'review-subscriptions'][idx % 4]!,
      position: 0,
      localTime: '19:00',
    })),
  },
]

