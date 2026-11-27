import { useState } from 'react'
import { Check, ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import { dayKey } from '../editor/noteActivity'

export type AgendaEntry = {
  id: string
  date: string
  time: string
  title: string
  color: string
  done: boolean
  noteId?: string
  minutes?: number
}

export default function AgendaView({
  items,
  selectedDate,
  onBack,
  onSelectDate,
  onToggle,
  onAdd,
  onEdit,
  onDelete,
  onOpenNote,
  goals
}: {
  items: AgendaEntry[]
  selectedDate: string
  onBack: () => void
  onSelectDate: (date: string) => void
  onToggle: (id: string) => void
  onAdd: () => void
  onEdit: (item: AgendaEntry) => void
  onOpenNote: (item: AgendaEntry) => void
  onDelete: (id: string) => void
  goals: React.ReactNode
}): React.JSX.Element {
  const [period, setPeriod] = useState<7 | 30>(7)
  const [expanded, setExpanded] = useState(true)
  const anchor = new Date(`${selectedDate}T12:00:00`)
  const start = new Date(anchor)
  if (period === 7) start.setDate(start.getDate() - (start.getDay() + 6) % 7)
  else start.setDate(1)
  const dateCount = period === 7 ? 7 : new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0).getDate()
  const dates = Array.from({ length: dateCount }, (_, index) =>
    dayKey(new Date(start.getFullYear(), start.getMonth(), start.getDate() + index)))
  const monthPadding = (start.getDay() + 6) % 7
  const shiftRange = (direction: number): void => {
    const next = new Date(start)
    if (period === 7) next.setDate(next.getDate() + 7 * direction)
    else next.setMonth(next.getMonth() + direction)
    onSelectDate(dayKey(next))
  }
  const dayItems = items
    .filter((item) => item.date === selectedDate)
    .sort((a, b) => a.time.localeCompare(b.time))
  const periodItems = items.filter((item) => dates.includes(item.date))
  const completed = periodItems.filter((item) => item.done).length
  const formatted = new Date(`${selectedDate}T12:00:00`).toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long'
  })
  const shortDate = (date: string): string => new Date(`${date}T12:00:00`).toLocaleDateString('zh-CN', {
    month: 'numeric', day: 'numeric', weekday: 'short'
  })
  const renderItems = (entries: AgendaEntry[]): React.ReactNode => entries.length ? entries.map((item) => (
    <div className="agenda-detail-item" key={item.id}>
      <span className="agenda-detail-time">{item.time || '全天'}</span>
      <i style={{ background: item.color }} />
      <div>
        <strong className={item.done ? 'done' : ''}>{item.title}</strong>
        <small>{item.done ? '已完成' : '待完成'}{item.minutes ? ` · ${item.minutes} 分钟` : ''}</small>
        {item.noteId && <button className="agenda-linked-note" onClick={() => onOpenNote(item)}>打开关联笔记</button>}
      </div>
      <div className="agenda-detail-actions">
        <button aria-label={`${item.done ? '取消完成' : '完成'} ${item.title}`} onClick={() => onToggle(item.id)}>
          <Check size={16} />
        </button>
        <button onClick={() => onEdit(item)}>编辑</button>
        <button onClick={() => onDelete(item.id)}>删除</button>
      </div>
    </div>
  )) : <p className="agenda-empty">{expanded ? '暂无日程' : '这一天还没有日程。'}</p>
  return (
    <section className="library-page agenda-page" aria-label="日程详情页面">
      <button className="back-link" onClick={onBack}>
        <ChevronLeft size={18} /> 返回首页
      </button>
      <header className="library-heading">
        <div>
          <h1>日程</h1>
          <p>安排今天，也留一点时间给书写</p>
        </div>
        <button className="recent-create" onClick={onAdd}>
          <Plus size={17} /> 新增日程
        </button>
      </header>
      <div className="agenda-overview">
        <div>
          <span>当日日程</span>
          <strong>{dayItems.length}</strong>
          <small>项</small>
        </div>
        <div>
          <span>已完成</span>
          <strong>{dayItems.filter((item) => item.done).length}</strong>
          <small>项</small>
        </div>
        <div>
          <span>{period === 7 ? '本周' : '本月'}完成率</span>
          <strong>
            {periodItems.length ? Math.round((completed / periodItems.length) * 100) : 0}%
          </strong>
          <small>
            {completed} / {periodItems.length} 项
          </small>
        </div>
      </div>
      <div className="agenda-detail-grid">
        <aside className="agenda-side" aria-label="日期与目标">
          <div className="agenda-date-panel">
            <div className="agenda-panel-heading">
              <h2>日期</h2>
              <div className="recent-tabs">
                {([7, 30] as const).map((value) => (
                  <button
                    key={value}
                    className={expanded && period === value ? 'active' : ''}
                    aria-pressed={expanded && period === value}
                    onClick={() => { setPeriod(value); setExpanded(true) }}
                  >
                    {value === 7 ? '周视图' : '月视图'}
                  </button>
                ))}
              </div>
            </div>
            <div className="agenda-range-nav">
              <button aria-label="上一时段" onClick={() => shiftRange(-1)}><ChevronLeft size={17} /></button>
              <span>{period === 7 ? `${dates[0].slice(5)} 至 ${dates.at(-1)!.slice(5)}` : `${anchor.getFullYear()} 年 ${anchor.getMonth() + 1} 月`}</span>
              <button aria-label="下一时段" onClick={() => shiftRange(1)}><ChevronRight size={17} /></button>
            </div>
            <div className={period === 7 ? 'agenda-date-list' : 'agenda-month-picker'}>
              {period === 30 && <>
                {['一', '二', '三', '四', '五', '六', '日'].map((day) => <small key={day}>{day}</small>)}
                {Array.from({ length: monthPadding }, (_, index) => <span key={`pad-${index}`} />)}
              </>}
              {dates.map((date) => {
                const count = items.filter((item) => item.date === date).length
                return (
                  <button
                    key={date}
                    className={date === selectedDate ? 'selected' : ''}
                    aria-pressed={date === selectedDate}
                    aria-label={`${shortDate(date)}，${count} 项日程`}
                    onClick={() => { onSelectDate(date); setExpanded(false) }}
                  >
                    <span>
                      {period === 7 ? shortDate(date) : Number(date.slice(-2))}
                    </span>
                    {period === 7 ? <small>{count ? `${count} 项` : '空闲'}</small> : count > 0 && <i className="agenda-date-dot" />}
                  </button>
                )
              })}
            </div>
          </div>
          {goals}
        </aside>
        <div className="agenda-timeline-panel">
          <div className="agenda-panel-heading">
            <h2>{expanded ? `${period === 7 ? '周视图' : '月视图'} · ${shortDate(dates[0])} — ${shortDate(dates.at(-1)!)}` : formatted}</h2>
            <div className="agenda-view-actions">
              <span>{expanded ? periodItems.length : dayItems.length} 项日程</span>
              <button onClick={() => setExpanded(!expanded)}>{expanded ? '查看单日' : period === 7 ? '展开整周' : '展开整月'}</button>
            </div>
          </div>
          <div key={`${selectedDate}:${expanded ? period : 'day'}`} className={`agenda-timeline date-enter${expanded && period === 7 ? ' agenda-week-timeline' : ''}`}>
            {expanded && period === 30 ? <div className="agenda-month-grid" aria-label="月历">
              {['周一', '周二', '周三', '周四', '周五', '周六', '周日'].map((day) => <strong key={day}>{day}</strong>)}
              {Array.from({ length: monthPadding }, (_, index) => <div key={`pad-${index}`} />)}
              {dates.map((date) => {
                const entries = periodItems.filter((item) => item.date === date).sort((a, b) => a.time.localeCompare(b.time))
                return <button key={date} className={date === selectedDate ? 'selected' : ''} aria-label={`${shortDate(date)}，${entries.length} 项日程`} onClick={() => { onSelectDate(date); setExpanded(false) }}>
                  <b>{Number(date.slice(-2))}</b>
                  {entries.slice(0, 2).map((item) => <span key={item.id} title={item.title}><i style={{ background: item.color }} />{item.title}</span>)}
                  {entries.length > 2 && <small>还有 {entries.length - 2} 项</small>}
                </button>
              })}
            </div> : expanded ? <div className="agenda-week-grid" aria-label="周历" role="region">
              {dates.map((date) => (
                <section className={`agenda-range-day${date === selectedDate ? ' selected' : ''}`} key={date} aria-label={shortDate(date)}>
                  <h3><button onClick={() => { onSelectDate(date); setExpanded(false) }}>{shortDate(date)}</button></h3>
                  <div className="agenda-week-items">
                    {renderItems(periodItems.filter((item) => item.date === date).sort((a, b) => a.time.localeCompare(b.time)))}
                  </div>
                </section>
              ))}
            </div> : renderItems(dayItems)}
          </div>
        </div>
      </div>
    </section>
  )
}
