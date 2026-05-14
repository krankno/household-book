import { useState, useEffect, useMemo } from 'react'

// 쿠팡 단기(일용직) 기본 공제
// - 국민연금/건강보험/장기요양: 1개월 미만 일용직 면제
// - 고용보험: 0.9%
// - 소득세: 일급 15만원 초과분 × 2.7% (6% × 45% 간이세액)
// - 지방소득세: 소득세의 10%
const DEFAULT_DEDUCTIONS = [
  { name: '고용보험', rate: 0.9, type: 'percent' },
]

function formatMoney(amount) {
  return new Intl.NumberFormat('ko-KR').format(Math.round(amount))
}

// 주휴수당 계산: 주 5일 이상 근무 시, (주간 기본근무시간 ÷ 5) × 시급
function calcWeeklyHolidayPay(weekBaseHours, weekDays, wage) {
  if (weekDays < 5) return 0
  return Math.round((weekBaseHours / 5) * wage)
}

function getCalendarDays(year, month) {
  const firstDay = new Date(year, month - 1, 1).getDay()
  const daysInMonth = new Date(year, month, 0).getDate()
  const days = []
  for (let i = 0; i < firstDay; i++) days.push(null)
  for (let d = 1; d <= daysInMonth; d++) days.push(d)
  // 마지막 줄을 7의 배수로 채움
  while (days.length % 7 !== 0) days.push(null)
  return days
}

export default function WorkTab({ currentMonth, changeMonth, monthLabel, onDataChange }) {
  const [hourlyWage, setHourlyWage] = useState(() => {
    return Number(localStorage.getItem('hb-hourly-wage')) || 9860
  })
  const [overtimeBase, setOvertimeBase] = useState(() => {
    return Number(localStorage.getItem('hb-overtime-base')) || 8
  })
  const [overtimeRate, setOvertimeRate] = useState(() => {
    return Number(localStorage.getItem('hb-overtime-rate')) || 1.5
  })
  const [workLogs, setWorkLogs] = useState(() => {
    const saved = localStorage.getItem('hb-work-logs')
    return saved ? JSON.parse(saved) : []
  })
  const [deductions, setDeductions] = useState(() => {
    const saved = localStorage.getItem('hb-deductions')
    if (saved) {
      const parsed = JSON.parse(saved)
      // 쿠팡 단기 마이그레이션: 일용직 면제 항목 및 일별 계산 항목 제거
      const removeNames = ['국민연금', '건강보험', '장기요양', '장기요양보험', '소득세', '지방소득세']
      const hasOld = parsed.some(d => removeNames.includes(d.name))
      if (hasOld) {
        const migrated = parsed.filter(d => !removeNames.includes(d.name))
        if (migrated.length === 0) migrated.push(...DEFAULT_DEDUCTIONS)
        localStorage.setItem('hb-deductions', JSON.stringify(migrated))
        return migrated
      }
      return parsed
    }
    return DEFAULT_DEDUCTIONS
  })
  const [showWorkForm, setShowWorkForm] = useState(false)
  const [showWageSettings, setShowWageSettings] = useState(false)
  const [editingLogId, setEditingLogId] = useState(null)
  const [workForm, setWorkForm] = useState({
    date: new Date().toISOString().split('T')[0],
    hours: '',
    memo: ''
  })

  useEffect(() => { localStorage.setItem('hb-hourly-wage', String(hourlyWage)); onDataChange?.() }, [hourlyWage, onDataChange])
  useEffect(() => { localStorage.setItem('hb-overtime-base', String(overtimeBase)); onDataChange?.() }, [overtimeBase, onDataChange])
  useEffect(() => { localStorage.setItem('hb-overtime-rate', String(overtimeRate)); onDataChange?.() }, [overtimeRate, onDataChange])
  useEffect(() => { localStorage.setItem('hb-work-logs', JSON.stringify(workLogs)); onDataChange?.() }, [workLogs, onDataChange])
  useEffect(() => { localStorage.setItem('hb-deductions', JSON.stringify(deductions)); onDataChange?.() }, [deductions, onDataChange])

  const [y, m] = currentMonth.split('-').map(Number)
  const calendarDays = useMemo(() => getCalendarDays(y, m), [y, m])

  const logsByDate = useMemo(() => {
    const map = {}
    workLogs.filter(l => l.date.startsWith(currentMonth)).forEach(l => {
      map[l.date] = l
    })
    return map
  }, [workLogs, currentMonth])

  const monthLogs = useMemo(() => {
    return workLogs.filter(l => l.date.startsWith(currentMonth)).sort((a, b) => a.date.localeCompare(b.date))
  }, [workLogs, currentMonth])

  const calc = useMemo(() => {
    let totalNormal = 0, totalOvertime = 0, totalHours = 0, workDays = 0
    let totalDailyIncomeTax = 0

    const dailyDetails = monthLogs.map(log => {
      const h = log.hours
      totalHours += h
      workDays++
      const normal = Math.min(h, overtimeBase)
      const ot = Math.max(0, h - overtimeBase)
      totalNormal += normal
      totalOvertime += ot

      const dailyPay = Math.round(normal * hourlyWage + ot * hourlyWage * overtimeRate)
      // 일용직 소득세: 일급 15만원 초과분 × 6% × (1 - 55%) = 2.7%
      const taxable = Math.max(0, dailyPay - 150000)
      const dailyTax = Math.round(taxable * 0.027)
      const dailyLocalTax = Math.round(dailyTax * 0.1)
      totalDailyIncomeTax += dailyTax + dailyLocalTax

      return { ...log, normal, ot, dailyPay, dailyTax, dailyLocalTax }
    })

    const normalPay = Math.round(totalNormal * hourlyWage)
    const overtimePay = Math.round(totalOvertime * hourlyWage * overtimeRate)

    // 주휴수당: 주 단위로 계산 (일~토 기준)
    let totalWeeklyHolidayPay = 0
    const calDays = getCalendarDays(y, m)
    for (let wi = 0; wi < calDays.length; wi += 7) {
      let weekHours = 0, weekDays = 0
      for (let di = wi; di < wi + 7 && di < calDays.length; di++) {
        const d = calDays[di]
        if (!d) continue
        const ds = `${currentMonth}-${String(d).padStart(2, '0')}`
        const log = monthLogs.find(l => l.date === ds)
        if (log) { weekHours += Math.min(log.hours, overtimeBase); weekDays++ }
      }
      totalWeeklyHolidayPay += calcWeeklyHolidayPay(weekHours, weekDays, hourlyWage)
    }

    const grossPay = normalPay + overtimePay + totalWeeklyHolidayPay

    // 고용보험 등 비율 공제
    let percentDeduction = 0
    const deductionDetails = deductions.map(d => {
      if (d.rate > 0) {
        const amt = Math.round(grossPay * d.rate / 100)
        percentDeduction += amt
        return { ...d, amount: amt }
      }
      return { ...d, amount: 0 }
    })

    // 소득세 합산 (일별 계산)
    const incomeTaxTotal = dailyDetails.reduce((s, d) => s + d.dailyTax, 0)
    const localTaxTotal = dailyDetails.reduce((s, d) => s + d.dailyLocalTax, 0)

    const totalDeduction = percentDeduction + totalDailyIncomeTax
    const netPay = grossPay - totalDeduction

    return {
      totalHours, totalNormal, totalOvertime, normalPay, overtimePay, grossPay,
      totalDeduction, deductionDetails, netPay, workDays,
      incomeTaxTotal, localTaxTotal, totalDailyIncomeTax, dailyDetails,
      totalWeeklyHolidayPay
    }
  }, [monthLogs, hourlyWage, overtimeBase, overtimeRate, deductions])

  function openWorkForm(dateStr, log = null) {
    if (log) {
      setWorkForm({ date: log.date, hours: String(log.hours), memo: log.memo || '' })
      setEditingLogId(log.id)
    } else {
      setWorkForm({ date: dateStr, hours: '', memo: '' })
      setEditingLogId(null)
    }
    setShowWorkForm(true)
  }

  function handleCalendarClick(day) {
    if (!day) return
    const dateStr = `${currentMonth}-${String(day).padStart(2, '0')}`
    const existing = logsByDate[dateStr]
    openWorkForm(dateStr, existing || null)
  }

  function saveWorkLog(e) {
    e.preventDefault()
    const hours = parseFloat(workForm.hours)
    if (!hours || hours <= 0 || hours > 24) return

    if (editingLogId) {
      setWorkLogs(prev => prev.map(l => l.id === editingLogId ? { ...l, ...workForm, hours } : l))
    } else {
      setWorkLogs(prev => [...prev, { ...workForm, hours, id: Date.now() }])
    }
    setShowWorkForm(false)
  }

  function deleteWorkLog() {
    if (editingLogId && confirm('이 근무 기록을 삭제하시겠습니까?')) {
      setWorkLogs(prev => prev.filter(l => l.id !== editingLogId))
      setShowWorkForm(false)
    }
  }

  function updateDeductionRate(index, rate) {
    setDeductions(prev => prev.map((d, i) => i === index ? { ...d, rate: Number(rate) || 0 } : d))
  }

  const today = new Date().toISOString().split('T')[0]

  return (
    <>
      <div className="month-nav">
        <button onClick={() => changeMonth(-1)}>◀</button>
        <span className="month-label">{monthLabel}</span>
        <button onClick={() => changeMonth(1)}>▶</button>
      </div>

      <div className="wage-summary">
        <div className="wage-info" onClick={() => setShowWageSettings(true)}>
          <span className="wage-label">시급</span>
          <span className="wage-value">{formatMoney(hourlyWage)}원</span>
          <span className="wage-edit-hint">설정 ›</span>
        </div>
      </div>

      <div className="pay-cards">
        <div className="pay-card">
          <div className="pay-card-label">근무</div>
          <div className="pay-card-value">{calc.workDays}일 / {calc.totalHours}시간</div>
        </div>
        <div className="pay-card primary">
          <div className="pay-card-label">예상 실수령액</div>
          <div className="pay-card-value big">{formatMoney(calc.netPay)}원</div>
        </div>
      </div>

      <div className="work-calendar">
        <div className="cal-grid">
          {['일', '월', '화', '수', '목', '금', '토'].map(d => (
            <div key={d} className={`cal-dow ${d === '일' ? 'sun' : d === '토' ? 'sat' : ''}`}>{d}</div>
          ))}
          {(() => {
            const cells = []
            let weekPay = 0
            let weekBaseHours = 0
            let weekWorkDays = 0
            calendarDays.forEach((day, i) => {
              if (!day) {
                cells.push(<div key={`e${i}`} className="cal-cell empty" />)
              } else {
                const dateStr = `${currentMonth}-${String(day).padStart(2, '0')}`
                const log = logsByDate[dateStr]
                const isToday = dateStr === today
                const dayOfWeek = (new Date(y, m - 1, day)).getDay()
                const isSun = dayOfWeek === 0
                const isSat = dayOfWeek === 6

                if (log) {
                  const h = log.hours
                  const normal = Math.min(h, overtimeBase)
                  const ot = Math.max(0, h - overtimeBase)
                  weekPay += Math.round(normal * hourlyWage + ot * hourlyWage * overtimeRate)
                  weekBaseHours += normal
                  weekWorkDays++
                }

                cells.push(
                  <div
                    key={day}
                    className={`cal-cell ${log ? 'has-log' : ''} ${isToday ? 'today' : ''}`}
                    onClick={() => handleCalendarClick(day)}
                  >
                    <span className={`cal-day ${isSun ? 'sun' : isSat ? 'sat' : ''}`}>{day}</span>
                    {log && (
                      <>
                        <span className="cal-hours">{log.hours}h</span>
                        {log.hours > overtimeBase && <span className="cal-ot">+{(log.hours - overtimeBase)}연장</span>}
                      </>
                    )}
                  </div>
                )
              }

              // 주 마지막 (토요일 = 7번째 열)에 주급 + 주휴수당 표시
              if ((i + 1) % 7 === 0 && i >= 7) {
                const holidayPay = calcWeeklyHolidayPay(weekBaseHours, weekWorkDays, hourlyWage)
                if (weekPay > 0) {
                  cells.push(
                    <div key={`week${i}`} className="cal-week-pay">
                      <span>{formatMoney(weekPay)}원</span>
                      {holidayPay > 0 && <span className="cal-holiday-pay">+주휴 {formatMoney(holidayPay)}원</span>}
                    </div>
                  )
                } else {
                  cells.push(<div key={`week${i}`} className="cal-week-pay empty" />)
                }
                weekPay = 0
                weekBaseHours = 0
                weekWorkDays = 0
              }
            })
            return cells
          })()}
        </div>
      </div>

      <div className="pay-breakdown">
        <h3>급여 상세</h3>
        <div className="breakdown-row">
          <span>기본급 ({calc.totalNormal}h × {formatMoney(hourlyWage)}원)</span>
          <span className="income-text">{formatMoney(calc.normalPay)}원</span>
        </div>
        <div className="breakdown-row">
          <span>연장수당 ({calc.totalOvertime}h × {formatMoney(hourlyWage)}원 × {overtimeRate})</span>
          <span className="income-text">{formatMoney(calc.overtimePay)}원</span>
        </div>
        {calc.totalWeeklyHolidayPay > 0 && (
          <div className="breakdown-row">
            <span>주휴수당</span>
            <span className="income-text">{formatMoney(calc.totalWeeklyHolidayPay)}원</span>
          </div>
        )}
        <div className="breakdown-row total-row">
          <span>총 급여</span>
          <span className="income-text">{formatMoney(calc.grossPay)}원</span>
        </div>

        <h3 className="deduction-title">공제 내역</h3>
        {calc.deductionDetails.map((d, i) => (
          d.amount > 0 && (
            <div key={i} className="breakdown-row">
              <span>{d.name} ({d.rate}%)</span>
              <span className="expense-text">-{formatMoney(d.amount)}원</span>
            </div>
          )
        ))}
        {calc.incomeTaxTotal > 0 && (
          <div className="breakdown-row">
            <span>소득세 (일급 15만원 초과 × 2.7%)</span>
            <span className="expense-text">-{formatMoney(calc.incomeTaxTotal)}원</span>
          </div>
        )}
        {calc.localTaxTotal > 0 && (
          <div className="breakdown-row">
            <span>지방소득세 (소득세 × 10%)</span>
            <span className="expense-text">-{formatMoney(calc.localTaxTotal)}원</span>
          </div>
        )}
        {calc.totalDeduction > 0 && (
          <div className="breakdown-row total-row">
            <span>공제 합계</span>
            <span className="expense-text">-{formatMoney(calc.totalDeduction)}원</span>
          </div>
        )}
        <div className="breakdown-row net-row">
          <span>실수령액</span>
          <span>{formatMoney(calc.netPay)}원</span>
        </div>
      </div>

      {showWorkForm && (
        <div className="modal-overlay" onClick={() => setShowWorkForm(false)}>
          <form className="modal" onClick={e => e.stopPropagation()} onSubmit={saveWorkLog}>
            <h3>{editingLogId ? '근무 수정' : '근무 추가'}</h3>
            <div className="work-form-date">
              {(() => {
                const d = new Date(workForm.date + 'T00:00:00')
                const dayNames = ['일', '월', '화', '수', '목', '금', '토']
                return `${d.getMonth() + 1}월 ${d.getDate()}일 (${dayNames[d.getDay()]})`
              })()}
            </div>
            <label>
              근무시간 (시간)
              <input
                type="number"
                step="0.5"
                min="0.5"
                max="24"
                placeholder="8"
                value={workForm.hours}
                onChange={e => setWorkForm(f => ({ ...f, hours: e.target.value }))}
                autoFocus
              />
            </label>
            <label>
              메모
              <input type="text" placeholder="선택사항" value={workForm.memo} onChange={e => setWorkForm(f => ({ ...f, memo: e.target.value }))} />
            </label>
            {workForm.hours && Number(workForm.hours) > 0 && (
              <div className="work-preview">
                <div className="work-preview-row">
                  <span>기본</span>
                  <span>{Math.min(Number(workForm.hours), overtimeBase)}h × {formatMoney(hourlyWage)}원 = {formatMoney(Math.min(Number(workForm.hours), overtimeBase) * hourlyWage)}원</span>
                </div>
                {Number(workForm.hours) > overtimeBase && (
                  <div className="work-preview-row overtime">
                    <span>연장</span>
                    <span>{(Number(workForm.hours) - overtimeBase).toFixed(1)}h × {formatMoney(hourlyWage * overtimeRate)}원 = {formatMoney((Number(workForm.hours) - overtimeBase) * hourlyWage * overtimeRate)}원</span>
                  </div>
                )}
                <div className="work-preview-row total">
                  <span>합계</span>
                  <span>{formatMoney(
                    Math.min(Number(workForm.hours), overtimeBase) * hourlyWage +
                    Math.max(0, Number(workForm.hours) - overtimeBase) * hourlyWage * overtimeRate
                  )}원</span>
                </div>
              </div>
            )}
            <div className="form-actions">
              {editingLogId && <button type="button" className="delete-form-btn" onClick={deleteWorkLog}>삭제</button>}
              <button type="button" className="cancel-btn" onClick={() => setShowWorkForm(false)}>취소</button>
              <button type="submit" className="save-btn">저장</button>
            </div>
          </form>
        </div>
      )}

      {showWageSettings && (
        <div className="modal-overlay" onClick={() => setShowWageSettings(false)}>
          <div className="modal wage-modal" onClick={e => e.stopPropagation()}>
            <h3>급여 설정</h3>
            <label>
              시급 (원)
              <input
                type="text"
                inputMode="numeric"
                value={formatMoney(hourlyWage)}
                onChange={e => {
                  const raw = e.target.value.replace(/[^0-9]/g, '')
                  setHourlyWage(Number(raw) || 0)
                }}
              />
            </label>
            <label>
              연장근로 기준시간
              <input type="number" step="1" min="1" max="24" value={overtimeBase} onChange={e => setOvertimeBase(Number(e.target.value) || 8)} />
            </label>
            <label>
              연장근로 배율
              <select value={overtimeRate} onChange={e => setOvertimeRate(Number(e.target.value))}>
                <option value="1.5">1.5배</option>
                <option value="2">2배</option>
                <option value="1">1배 (동일)</option>
              </select>
            </label>
            <h4 className="deduction-setting-title">공제 항목</h4>
            {deductions.map((d, i) => (
              <div key={i} className="deduction-row">
                <span className="deduction-name">{d.name}</span>
                <input className="deduction-input" type="number" step="0.01" min="0" max="100" value={d.rate} onChange={e => updateDeductionRate(i, e.target.value)} />
                <span className="deduction-pct">%</span>
              </div>
            ))}
            <div className="settings-hint-box">
              <p className="settings-hint">💡 쿠팡 단기(일용직) 기준 공제</p>
              <p className="settings-hint-detail">• 국민연금/건강보험/장기요양: 1개월 미만 면제</p>
              <p className="settings-hint-detail">• 소득세: 일급 15만원 초과분 × 2.7%</p>
              <p className="settings-hint-detail">• 지방소득세: 소득세의 10%</p>
              <p className="settings-hint-detail">• 소득세/지방소득세는 자동 계산됩니다</p>
            </div>
            <div className="form-actions">
              <button type="button" className="save-btn" onClick={() => setShowWageSettings(false)}>완료</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
