import { useState } from 'react'
import { CalendarDays, Check, ChevronLeft, Plus } from 'lucide-react'

export type AgendaEntry = {
  id: string
  date: string
  time: string
  title: string
  color: string
  done: boolean
}

export default function AgendaView({
  items,
  selectedDate,
  onBack,
  onSelectDate,
  onToggle,
  onAdd,
  onEdit,
  onDelete
}: {
  items: AgendaEntry[]
  selectedDate: string
  onBack: () => void
  onSelectDate: (date: string) => void
  onToggle: (id: string) => void
  onAdd: () => void
  onEdit: (item: AgendaEntry) => void
  onDelete: (id: string) => void
}): React.JSX.Element {
  const [period, setPeriod] = useState<7 | 30>(7)
  const dates = Array.from({ length: period }, (_, index) => {
    const date = new Date(`${selectedDate}T12:00:00`)
    date.setDate(date.getDate() + index - (period === 7 ? 3 : 14))
    return date.toISOString().slice(0, 10)
  })
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
          <CalendarDays size={19} />
          <span>所选日期</span>
          <strong>{formatted}</strong>
        </div>
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
          <span>近 {period} 天完成</span>
          <strong>
            {periodItems.length ? Math.round((completed / periodItems.length) * 100) : 0}%
          </strong>
          <small>
            {completed} / {periodItems.length} 项
          </small>
        </div>
      </div>
      <div className="agenda-detail-grid">
        <div className="agenda-date-panel">
          <div className="agenda-panel-heading">
            <h2>日期</h2>
            <div className="recent-tabs">
              {([7, 30] as const).map((value) => (
                <button
                  key={value}
                  className={period === value ? 'active' : ''}
                  onClick={() => setPeriod(value)}
                >
                  {value} 天
                </button>
              ))}
            </div>
          </div>
          <div className="agenda-date-list">
            {dates.map((date) => {
              const count = items.filter((item) => item.date === date).length
              return (
                <button
                  key={date}
                  className={date === selectedDate ? 'selected' : ''}
                  onClick={() => onSelectDate(date)}
                >
                  <span>
                    {new Date(`${date}T12:00:00`).toLocaleDateString('zh-CN', {
                      month: 'numeric',
                      day: 'numeric',
                      weekday: 'short'
                    })}
                  </span>
                  <small>{count ? `${count} 项` : '空闲'}</small>
                </button>
              )
            })}
          </div>
        </div>
        <div className="agenda-timeline-panel">
          <div className="agenda-panel-heading">
            <h2>{formatted}</h2>
            <span>{dayItems.length} 项日程</span>
          </div>
          <div className="agenda-timeline">
            {dayItems.length ? (
              dayItems.map((item) => (
                <div className="agenda-detail-item" key={item.id}>
                  <span className="agenda-detail-time">{item.time}</span>
                  <i style={{ background: item.color }} />
                  <div>
                    <strong className={item.done ? 'done' : ''}>{item.title}</strong>
                    <small>{item.done ? '已完成' : '待完成'}</small>
                  </div>
                  <button
                    aria-label={`${item.done ? '取消完成' : '完成'} ${item.title}`}
                    onClick={() => onToggle(item.id)}
                  >
                    <Check size={17} />
                  </button>
                  <button onClick={() => onEdit(item)}>编辑</button>
                  <button onClick={() => onDelete(item.id)}>删除</button>
                </div>
              ))
            ) : (
              <p className="agenda-empty">这一天还没有日程。可以先留给自己一段安静的时间。</p>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}
