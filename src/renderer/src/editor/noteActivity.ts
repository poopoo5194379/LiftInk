import type { NoteRecord } from '../../../shared/editor'

const dateTime = new Intl.DateTimeFormat('zh-CN', {
  year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false
})

export function noteDate(note: NoteRecord): string {
  const date = note.updatedAt ?? note.createdAt
  return date === undefined ? (note.date === '刚刚' ? '日期未知' : note.date) : dateTime.format(date)
}

export function noteDateDetail(note: NoteRecord): string {
  return `创建 ${note.createdAt === undefined ? '日期未知' : dateTime.format(note.createdAt)} · 修改 ${noteDate(note)}`
}

export function dayKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000)
  const minutes = Math.floor(seconds / 60)
  if (minutes >= 60) return `${Math.floor(minutes / 60)} 小时 ${minutes % 60} 分`
  return minutes ? `${minutes} 分 ${seconds % 60} 秒` : `${seconds} 秒`
}

export function focusTotal(note: Pick<NoteRecord, 'focusByDay'>, since = ''): number {
  return Object.entries(note.focusByDay ?? {}).reduce((total, [day, ms]) => day >= since ? total + ms : total, 0)
}
