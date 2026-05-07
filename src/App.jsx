import { useState, useEffect, useMemo, useRef } from 'react'
import Tesseract from 'tesseract.js'
import WorkTab from './WorkTab'
import './App.css'

const DEFAULT_CATEGORIES = ['식비', '교통', '주거', '통신', '의료', '교육', '문화', '의류', '생활용품', '경조사', '저축/투자', '기타']

const DEFAULT_ICONS = {
  '식비': '🍚', '교통': '🚌', '주거': '🏠', '통신': '📱',
  '의료': '🏥', '교육': '📚', '문화': '🎬', '의류': '👕',
  '생활용품': '🧴', '경조사': '💐', '저축/투자': '📈', '기타': '📤'
}

const ICON_OPTIONS = ['🍚', '🚌', '🏠', '📱', '🏥', '📚', '🎬', '👕', '🧴', '💐', '📈', '📤', '🎮', '✈️', '🐶', '🏋️', '💊', '🍺', '☕', '🛒', '💻', '🎁', '💇', '🏖️', '🚗', '⛽', '📦', '🔧']

const CATEGORY_KEYWORDS = {
  '식비': ['치킨', '피자', '커피', '카페', '음식', '식당', '배달', '떡볶이', '김밥', '라면', '국밥', '찌개', '삼겹살', '초밥', '스시', '버거', '맥도날드', '스타벅스', '이디야', '투썸', '빽다방', 'BBQ', 'BHC', '교촌', '굽네', '편의점', 'CU', 'GS25', 'GS', '세븐일레븐', '이마트24', '미니스톱', '요기요', '배민', '쿠팡이츠', '마트', '이마트', '홈플러스', '롯데마트', '빵', '베이커리', '뚜레쥬르', '파리바게뜨', '맘스터치', '롯데리아', 'KFC', '서브웨이', '도미노', '족발', '보쌈', '감자탕', '설렁탕', '냉면', '칼국수', '짜장', '짬뽕', '분식', '반찬', '도시락'],
  '교통': ['택시', '버스', '지하철', '주유', '주차', '톨게이트', '고속도로', '교통', '카카오T', 'KTX', 'SRT', '기차', '항공', '비행기', '대리운전', '기름', '경유', '휘발유', 'LPG', '하이패스'],
  '주거': ['월세', '관리비', '전기', '수도', '가스', '인터넷', '아파트', '부동산', '이사', '수리', '인테리어'],
  '통신': ['SKT', 'KT', 'LG', '통신', '핸드폰', '휴대폰', '요금'],
  '의료': ['병원', '약국', '의원', '치과', '안과', '피부과', '내과', '외과', '한의원', '약', '진료', '의료', '건강', '검진'],
  '교육': ['학원', '교육', '학교', '수업', '강의', '교재', '책', '도서', '학습', '과외', '인강'],
  '문화': ['영화', 'CGV', '메가박스', '롯데시네마', '넷플릭스', '유튜브', '구독', '게임', '공연', '콘서트', '전시', 'PC방', '노래방'],
  '의류': ['옷', '신발', '가방', '유니클로', '자라', 'ZARA', '나이키', '아디다스', '무신사', '의류', '패션'],
  '생활용품': ['다이소', '생활용품', '세제', '샴푸', '화장품', '올리브영', '세탁', '쿠팡', '택배'],
  '경조사': ['축의금', '부의금', '선물', '결혼', '장례', '돌잔치', '생일', '기념일', '꽃']
}

function formatMoney(amount) {
  return new Intl.NumberFormat('ko-KR').format(amount)
}

function getMonthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

function guessCategory(text, categories) {
  const lower = text.toLowerCase()
  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (categories.includes(category)) {
      for (const kw of keywords) {
        if (lower.includes(kw.toLowerCase())) return category
      }
    }
  }
  return categories[categories.length - 1] || '기타'
}

function parseReceiptText(text, categories) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
  const results = []
  const today = new Date().toISOString().split('T')[0]

  let receiptDate = today
  for (const line of lines) {
    const dateMatch = line.match(/(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})/)
    if (dateMatch) {
      const [, yr, mo, da] = dateMatch
      receiptDate = `${yr}-${mo.padStart(2, '0')}-${da.padStart(2, '0')}`
      break
    }
  }

  const totalPatterns = [
    /(?:합\s*계|총\s*액|총\s*합|결제\s*금액|승인\s*금액|총\s*결제|카드\s*결제|실결제|받을\s*금액|total)\s*[:\s]*[\D]*([\d,]+)\s*원?/i,
    /(?:합\s*계|총\s*액|총\s*합|결제\s*금액|승인\s*금액|총\s*결제|카드\s*결제|실결제|받을\s*금액|total)\s*[:\s]*([\d,]+)/i,
  ]

  let totalAmount = 0
  for (const line of lines) {
    for (const pattern of totalPatterns) {
      const match = line.match(pattern)
      if (match) {
        const amt = parseInt(match[1].replace(/,/g, ''), 10)
        if (amt > totalAmount && amt < 100000000) totalAmount = amt
      }
    }
  }

  if (totalAmount > 0) {
    const category = guessCategory(text, categories)
    const storeName = lines[0]?.replace(/[^\w가-힣\s]/g, '').trim().slice(0, 20) || ''
    results.push({ category, amount: totalAmount, memo: storeName || '영수증 스캔', date: receiptDate })
    return results
  }

  const itemPattern = /(.+?)\s+([\d,]+)\s*원?/
  const seen = new Set()
  for (const line of lines) {
    const match = line.match(itemPattern)
    if (match) {
      const name = match[1].replace(/[^\w가-힣\s]/g, '').trim()
      const amount = parseInt(match[2].replace(/,/g, ''), 10)
      if (amount >= 100 && amount < 100000000 && name.length > 0 && !seen.has(name)) {
        seen.add(name)
        results.push({ category: guessCategory(name + ' ' + text, categories), amount, memo: name.slice(0, 30), date: receiptDate })
      }
    }
  }

  if (results.length === 0) {
    const amounts = []
    const amountRegex = /([\d,]{3,})\s*원/g
    let m
    while ((m = amountRegex.exec(text)) !== null) {
      const amt = parseInt(m[1].replace(/,/g, ''), 10)
      if (amt >= 100 && amt < 100000000) amounts.push(amt)
    }
    if (amounts.length > 0) {
      results.push({ category: guessCategory(text, categories), amount: Math.max(...amounts), memo: '이미지 스캔', date: receiptDate })
    }
  }

  return results
}

function App() {
  const [entries, setEntries] = useState(() => {
    const saved = localStorage.getItem('household-book')
    return saved ? JSON.parse(saved) : []
  })
  const [categories, setCategories] = useState(() => {
    const saved = localStorage.getItem('household-book-categories')
    return saved ? JSON.parse(saved) : DEFAULT_CATEGORIES
  })
  const [categoryIcons, setCategoryIcons] = useState(() => {
    const saved = localStorage.getItem('household-book-icons')
    return saved ? JSON.parse(saved) : DEFAULT_ICONS
  })
  const [currentMonth, setCurrentMonth] = useState(() => getMonthKey(new Date()))
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState({
    category: '식비',
    amount: '',
    memo: '',
    date: new Date().toISOString().split('T')[0]
  })
  const [showCategoryManager, setShowCategoryManager] = useState(false)
  const [newCatName, setNewCatName] = useState('')
  const [newCatIcon, setNewCatIcon] = useState('📤')
  const [editingCat, setEditingCat] = useState(null)
  const [activeTab, setActiveTab] = useState('expense')
  const [analyzing, setAnalyzing] = useState(false)
  const [analyzeProgress, setAnalyzeProgress] = useState(0)
  const [analyzeResult, setAnalyzeResult] = useState(null)
  const [analyzeError, setAnalyzeError] = useState('')
  const [ocrText, setOcrText] = useState('')
  const [previewImage, setPreviewImage] = useState(null)
  const fileInputRef = useRef(null)

  useEffect(() => {
    localStorage.setItem('household-book', JSON.stringify(entries))
  }, [entries])

  useEffect(() => {
    localStorage.setItem('household-book-categories', JSON.stringify(categories))
  }, [categories])

  useEffect(() => {
    localStorage.setItem('household-book-icons', JSON.stringify(categoryIcons))
  }, [categoryIcons])

  const monthEntries = useMemo(() => {
    return entries
      .filter(e => e.date.startsWith(currentMonth))
      .sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id)
  }, [entries, currentMonth])

  const totalExpense = useMemo(() => {
    return monthEntries.reduce((s, e) => s + e.amount, 0)
  }, [monthEntries])

  const categoryTotals = useMemo(() => {
    const totals = {}
    monthEntries.forEach(e => {
      totals[e.category] = (totals[e.category] || 0) + e.amount
    })
    return Object.entries(totals).sort((a, b) => b[1] - a[1])
  }, [monthEntries])

  function changeMonth(delta) {
    const [y, m] = currentMonth.split('-').map(Number)
    const d = new Date(y, m - 1 + delta)
    setCurrentMonth(getMonthKey(d))
  }

  function openForm(entry = null) {
    if (entry) {
      setForm({ category: entry.category, amount: String(entry.amount), memo: entry.memo, date: entry.date })
      setEditingId(entry.id)
    } else {
      setForm({ category: categories[0] || '기타', amount: '', memo: '', date: new Date().toISOString().split('T')[0] })
      setEditingId(null)
    }
    setShowForm(true)
  }

  function saveEntry(e) {
    e.preventDefault()
    const amount = parseInt(form.amount.replace(/,/g, ''), 10)
    if (!amount || amount <= 0) return

    if (editingId) {
      setEntries(prev => prev.map(en => en.id === editingId ? { ...en, ...form, amount } : en))
    } else {
      setEntries(prev => [...prev, { ...form, amount, id: Date.now() }])
    }
    setShowForm(false)
  }

  function deleteEntry(id) {
    if (confirm('삭제하시겠습니까?')) {
      setEntries(prev => prev.filter(e => e.id !== id))
    }
  }

  function addCategory() {
    const name = newCatName.trim()
    if (!name || categories.includes(name)) return
    setCategories(prev => [...prev, name])
    setCategoryIcons(prev => ({ ...prev, [name]: newCatIcon }))
    setNewCatName('')
    setNewCatIcon('📤')
  }

  function deleteCategory(cat) {
    if (categories.length <= 1) return
    if (!confirm(`"${cat}" 카테고리를 삭제하시겠습니까?`)) return
    setCategories(prev => prev.filter(c => c !== cat))
    setCategoryIcons(prev => {
      const next = { ...prev }
      delete next[cat]
      return next
    })
  }

  function startEditCategory(cat) {
    setEditingCat({ original: cat, name: cat, icon: categoryIcons[cat] || '📤' })
  }

  function saveEditCategory() {
    if (!editingCat) return
    const { original, name, icon } = editingCat
    const trimmed = name.trim()
    if (!trimmed) return

    if (trimmed !== original) {
      setCategories(prev => prev.map(c => c === original ? trimmed : c))
      setEntries(prev => prev.map(e => e.category === original ? { ...e, category: trimmed } : e))
    }
    setCategoryIcons(prev => {
      const next = { ...prev }
      if (trimmed !== original) delete next[original]
      next[trimmed] = icon
      return next
    })
    setEditingCat(null)
  }

  function moveCategoryUp(index) {
    if (index <= 0) return
    setCategories(prev => {
      const next = [...prev]
      ;[next[index - 1], next[index]] = [next[index], next[index - 1]]
      return next
    })
  }

  async function handleImageUpload(e) {
    const file = e.target.files[0]
    if (!file) return
    e.target.value = ''

    const reader = new FileReader()
    reader.onload = async () => {
      const dataUrl = reader.result
      setPreviewImage(dataUrl)
      setAnalyzeResult(null)
      setAnalyzeError('')
      setOcrText('')
      setAnalyzeProgress(0)
      setAnalyzing(true)

      try {
        const { data } = await Tesseract.recognize(dataUrl, 'kor+eng', {
          logger: (info) => {
            if (info.status === 'recognizing text') {
              setAnalyzeProgress(Math.round(info.progress * 100))
            }
          }
        })

        const text = data.text
        setOcrText(text)

        if (!text.trim()) {
          setAnalyzeError('이미지에서 텍스트를 찾을 수 없습니다.')
          return
        }

        const results = parseReceiptText(text, categories)
        if (results.length === 0) {
          setAnalyzeError('금액 정보를 찾을 수 없습니다. 직접 입력해주세요.')
        } else {
          setAnalyzeResult(results)
        }
      } catch (err) {
        setAnalyzeError('이미지 분석에 실패했습니다: ' + err.message)
      } finally {
        setAnalyzing(false)
      }
    }
    reader.readAsDataURL(file)
  }

  function addAnalyzedEntries(items) {
    const newEntries = items.map((item, i) => ({
      category: categories.includes(item.category) ? item.category : categories[categories.length - 1],
      amount: Math.abs(Math.round(Number(item.amount))) || 0,
      memo: item.memo || '',
      date: item.date || new Date().toISOString().split('T')[0],
      id: Date.now() + i
    })).filter(e => e.amount > 0)

    setEntries(prev => [...prev, ...newEntries])
    setAnalyzeResult(null)
    setPreviewImage(null)
    setOcrText('')
  }

  function removeAnalyzedItem(index) {
    setAnalyzeResult(prev => prev.filter((_, i) => i !== index))
  }

  function updateAnalyzedItem(index, updates) {
    setAnalyzeResult(prev => prev.map((item, i) => i === index ? { ...item, ...updates } : item))
  }

  const [y, m] = currentMonth.split('-').map(Number)
  const monthLabel = `${y}년 ${m}월`

  const groupedByDate = useMemo(() => {
    const groups = {}
    monthEntries.forEach(e => {
      if (!groups[e.date]) groups[e.date] = []
      groups[e.date].push(e)
    })
    return Object.entries(groups).sort((a, b) => b[0].localeCompare(a[0]))
  }, [monthEntries])

  return (
    <div className="app">
      <header>
        <div className="header-row">
          <h1>가계부</h1>
          <button className="settings-btn" onClick={() => setShowCategoryManager(true)}>⚙️</button>
        </div>
        <div className="tab-nav">
          <button className={`tab-btn ${activeTab === 'expense' ? 'active' : ''}`} onClick={() => setActiveTab('expense')}>지출</button>
          <button className={`tab-btn ${activeTab === 'work' ? 'active' : ''}`} onClick={() => setActiveTab('work')}>근무/수입</button>
        </div>
      </header>

      {activeTab === 'work' && (
        <WorkTab currentMonth={currentMonth} changeMonth={changeMonth} monthLabel={monthLabel} />
      )}

      {activeTab === 'expense' && <>
      <div className="month-nav">
        <button onClick={() => changeMonth(-1)}>◀</button>
        <span className="month-label">{monthLabel}</span>
        <button onClick={() => changeMonth(1)}>▶</button>
      </div>

      <div className="total-expense">
        <span className="total-label">이번 달 지출</span>
        <span className="total-amount">{formatMoney(totalExpense)}원</span>
      </div>

      {categoryTotals.length > 0 && (
        <div className="category-chart">
          <h3>카테고리별 지출</h3>
          {categoryTotals.map(([cat, total]) => (
            <div key={cat} className="chart-row">
              <span className="chart-label">{categoryIcons[cat] || '📤'} {cat}</span>
              <div className="chart-bar-bg">
                <div className="chart-bar" style={{ width: `${(total / categoryTotals[0][1]) * 100}%` }} />
              </div>
              <span className="chart-value">{formatMoney(total)}원</span>
            </div>
          ))}
        </div>
      )}

      <div className="entries-section">
        <h3>내역</h3>
        {groupedByDate.length === 0 && <p className="empty">이번 달 내역이 없습니다.</p>}
        {groupedByDate.map(([date, items]) => {
          const d = new Date(date + 'T00:00:00')
          const dayNames = ['일', '월', '화', '수', '목', '금', '토']
          const dateLabel = `${d.getMonth() + 1}/${d.getDate()} (${dayNames[d.getDay()]})`
          const dayTotal = items.reduce((s, i) => s + i.amount, 0)

          return (
            <div key={date} className="date-group">
              <div className="date-header">
                <span className="date-label">{dateLabel}</span>
                <span className="expense-text">-{formatMoney(dayTotal)}원</span>
              </div>
              {items.map(entry => (
                <div key={entry.id} className="entry-item" onClick={() => openForm(entry)}>
                  <div className="entry-left">
                    <span className="entry-icon">{categoryIcons[entry.category] || '📤'}</span>
                    <div className="entry-info">
                      <span className="entry-category">{entry.category}</span>
                      {entry.memo && <span className="entry-memo">{entry.memo}</span>}
                    </div>
                  </div>
                  <div className="entry-right">
                    <span className="entry-amount expense">-{formatMoney(entry.amount)}원</span>
                    <button className="delete-btn" onClick={(e) => { e.stopPropagation(); deleteEntry(entry.id) }}>✕</button>
                  </div>
                </div>
              ))}
            </div>
          )
        })}
      </div>

      <input ref={fileInputRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={handleImageUpload} />

      <div className="fab-group">
        <button className="fab scan-fab" onClick={() => fileInputRef.current?.click()}>📷</button>
        <button className="fab" onClick={() => openForm()}>+</button>
      </div>

      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <form className="modal" onClick={e => e.stopPropagation()} onSubmit={saveEntry}>
            <h3>{editingId ? '수정' : '새 지출'}</h3>
            <label>
              날짜
              <input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
            </label>
            <label>
              카테고리
              <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
                {categories.map(c => <option key={c} value={c}>{categoryIcons[c] || '📤'} {c}</option>)}
              </select>
            </label>
            <label>
              금액 (원)
              <input
                type="text"
                inputMode="numeric"
                placeholder="0"
                value={form.amount}
                onChange={e => {
                  const raw = e.target.value.replace(/[^0-9]/g, '')
                  setForm(f => ({ ...f, amount: raw ? formatMoney(Number(raw)) : '' }))
                }}
              />
            </label>
            <label>
              메모
              <input type="text" placeholder="선택사항" value={form.memo} onChange={e => setForm(f => ({ ...f, memo: e.target.value }))} />
            </label>
            <div className="form-actions">
              <button type="button" className="cancel-btn" onClick={() => setShowForm(false)}>취소</button>
              <button type="submit" className="save-btn">저장</button>
            </div>
          </form>
        </div>
      )}

      {showCategoryManager && (
        <div className="modal-overlay" onClick={() => { setShowCategoryManager(false); setEditingCat(null) }}>
          <div className="modal category-modal" onClick={e => e.stopPropagation()}>
            <h3>카테고리 관리</h3>
            <div className="cat-list">
              {categories.map((cat, idx) => (
                <div key={cat} className="cat-item">
                  {editingCat?.original === cat ? (
                    <div className="cat-edit-form">
                      <div className="cat-edit-row">
                        <select className="icon-select" value={editingCat.icon} onChange={e => setEditingCat(prev => ({ ...prev, icon: e.target.value }))}>
                          {ICON_OPTIONS.map(ic => <option key={ic} value={ic}>{ic}</option>)}
                        </select>
                        <input className="cat-edit-input" value={editingCat.name} onChange={e => setEditingCat(prev => ({ ...prev, name: e.target.value }))} />
                      </div>
                      <div className="cat-edit-actions">
                        <button type="button" className="cat-btn save" onClick={saveEditCategory}>저장</button>
                        <button type="button" className="cat-btn" onClick={() => setEditingCat(null)}>취소</button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="cat-left">
                        {idx > 0 && <button className="cat-move-btn" onClick={() => moveCategoryUp(idx)}>▲</button>}
                        <span className="cat-icon">{categoryIcons[cat] || '📤'}</span>
                        <span className="cat-name">{cat}</span>
                      </div>
                      <div className="cat-actions">
                        <button className="cat-btn edit" onClick={() => startEditCategory(cat)}>수정</button>
                        <button className="cat-btn del" onClick={() => deleteCategory(cat)}>삭제</button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
            <div className="cat-add">
              <select className="icon-select" value={newCatIcon} onChange={e => setNewCatIcon(e.target.value)}>
                {ICON_OPTIONS.map(ic => <option key={ic} value={ic}>{ic}</option>)}
              </select>
              <input className="cat-add-input" placeholder="새 카테고리 이름" value={newCatName} onChange={e => setNewCatName(e.target.value)} onKeyDown={e => e.key === 'Enter' && addCategory()} />
              <button className="cat-btn add" onClick={addCategory}>추가</button>
            </div>
            <div className="form-actions">
              <button type="button" className="save-btn" onClick={() => { setShowCategoryManager(false); setEditingCat(null) }}>완료</button>
            </div>
          </div>
        </div>
      )}

      {(analyzing || analyzeResult || analyzeError) && (
        <div className="modal-overlay" onClick={() => { if (!analyzing) { setAnalyzeResult(null); setAnalyzeError(''); setPreviewImage(null); setOcrText('') } }}>
          <div className="modal analyze-modal" onClick={e => e.stopPropagation()}>
            <h3>영수증 스캔</h3>
            {previewImage && (
              <div className="analyze-preview">
                <img src={previewImage} alt="업로드 이미지" />
              </div>
            )}
            {analyzing && (
              <div className="analyze-loading">
                <div className="progress-bar-bg">
                  <div className="progress-bar" style={{ width: `${analyzeProgress}%` }} />
                </div>
                <p>텍스트 인식 중... {analyzeProgress}%</p>
              </div>
            )}
            {analyzeError && (
              <div className="analyze-error">
                <p>❌ {analyzeError}</p>
                {ocrText && (
                  <details className="ocr-details">
                    <summary>인식된 텍스트 보기</summary>
                    <pre>{ocrText}</pre>
                  </details>
                )}
                <div className="form-actions">
                  <button type="button" className="cancel-btn" onClick={() => { setAnalyzeError(''); setPreviewImage(null); setOcrText('') }}>닫기</button>
                </div>
              </div>
            )}
            {analyzeResult && analyzeResult.length > 0 && (
              <div className="analyze-results">
                <p className="result-count">{analyzeResult.length}건의 내역을 찾았습니다</p>
                <div className="result-list">
                  {analyzeResult.map((item, i) => (
                    <div key={i} className="result-item-edit">
                      <div className="result-item-row">
                        <div className="result-left">
                          <span className="entry-icon">{categoryIcons[item.category] || '📤'}</span>
                          <span className="entry-memo">{item.memo}</span>
                        </div>
                        <div className="result-right">
                          <span className="entry-amount expense">-{formatMoney(item.amount)}원</span>
                          <button className="delete-btn" onClick={() => removeAnalyzedItem(i)}>✕</button>
                        </div>
                      </div>
                      <div className="result-edit-row">
                        <select className="result-select" value={item.category} onChange={e => updateAnalyzedItem(i, { category: e.target.value })}>
                          {categories.map(c => <option key={c} value={c}>{categoryIcons[c] || '📤'} {c}</option>)}
                        </select>
                      </div>
                    </div>
                  ))}
                </div>
                {ocrText && (
                  <details className="ocr-details">
                    <summary>인식된 텍스트 보기</summary>
                    <pre>{ocrText}</pre>
                  </details>
                )}
                <div className="form-actions">
                  <button type="button" className="cancel-btn" onClick={() => { setAnalyzeResult(null); setPreviewImage(null); setOcrText('') }}>취소</button>
                  <button type="button" className="save-btn" onClick={() => addAnalyzedEntries(analyzeResult)}>전체 추가</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      </>}
    </div>
  )
}

export default App
