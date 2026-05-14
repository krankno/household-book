import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import WorkTab from './WorkTab'
import { cloudSave, cloudRestore, cloudLoad } from './supabase'
import './App.css'

const VISION_API_KEY = 'AIzaSyD9wyKx-SB9mADrhRGFHhVmRIsCPdfT6MM'

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

// 외화 통화 매핑 (심볼 → 통화코드)
const CURRENCY_MAP = {
  '원': 'KRW', '₩': 'KRW', 'KRW': 'KRW',
  '$': 'USD', 'USD': 'USD',
  '¥': 'JPY', 'JPY': 'JPY', '円': 'JPY',
  '€': 'EUR', 'EUR': 'EUR',
  '£': 'GBP', 'GBP': 'GBP',
  'CNY': 'CNY', '元': 'CNY', 'RMB': 'CNY',
}

const CURRENCY_DISPLAY = {
  'KRW': '₩', 'USD': '$', 'JPY': '¥', 'EUR': '€', 'GBP': '£', 'CNY': '¥',
}

// 실시간 환율 캐시 (1일 1회 갱신)
let cachedRates = null
let cacheTime = 0

async function getExchangeRates() {
  const now = Date.now()
  // 캐시가 24시간 이내면 재사용
  if (cachedRates && (now - cacheTime) < 24 * 60 * 60 * 1000) {
    return cachedRates
  }
  // localStorage 캐시 확인
  const saved = localStorage.getItem('hb-exchange-rates')
  if (saved) {
    const { rates, time } = JSON.parse(saved)
    if ((now - time) < 24 * 60 * 60 * 1000) {
      cachedRates = rates
      cacheTime = time
      return rates
    }
  }
  try {
    const res = await fetch('https://open.er-api.com/v6/latest/KRW')
    const data = await res.json()
    if (data.result === 'success') {
      // KRW 기준 → 각 통화 1단위당 KRW 환산
      const krwRates = {}
      Object.entries(data.rates).forEach(([code, rate]) => {
        krwRates[code] = Math.round((1 / rate) * 100) / 100
      })
      krwRates['KRW'] = 1
      cachedRates = krwRates
      cacheTime = now
      localStorage.setItem('hb-exchange-rates', JSON.stringify({ rates: krwRates, time: now }))
      return krwRates
    }
  } catch (e) {
    console.error('Exchange rate fetch failed:', e)
  }
  // 폴백 고정 환율
  return { KRW: 1, USD: 1380, JPY: 9.5, EUR: 1500, GBP: 1750, CNY: 190 }
}

function detectCurrency(text) {
  const currencyPatterns = [
    { regex: /\$\s*([\d,]+\.?\d*)/g, currency: 'USD' },
    { regex: /([\d,]+\.?\d*)\s*(?:USD|dollars?)/gi, currency: 'USD' },
    { regex: /¥\s*([\d,]+)/g, currency: 'JPY' },
    { regex: /([\d,]+)\s*(?:JPY|円)/gi, currency: 'JPY' },
    { regex: /€\s*([\d,]+\.?\d*)/g, currency: 'EUR' },
    { regex: /([\d,]+\.?\d*)\s*(?:EUR|euros?)/gi, currency: 'EUR' },
    { regex: /£\s*([\d,]+\.?\d*)/g, currency: 'GBP' },
    { regex: /([\d,]+\.?\d*)\s*(?:GBP|pounds?)/gi, currency: 'GBP' },
    { regex: /([\d,]+)\s*元/g, currency: 'CNY' },
    { regex: /([\d,]+)\s*(?:CNY|RMB)/gi, currency: 'CNY' },
  ]

  for (const { regex, currency } of currencyPatterns) {
    if (regex.test(text)) {
      return currency
    }
  }
  return null
}

async function parseReceiptText(text, categories) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
  const fullText = lines.join(' ')
  const results = []
  const today = new Date().toISOString().split('T')[0]
  const currentYear = new Date().getFullYear()

  // 날짜 감지
  let receiptDate = today
  for (const line of lines) {
    // 2024-05-06, 2024.05.06, 2024/05/06
    const dateMatch = line.match(/(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})/)
    if (dateMatch) {
      const [, yr, mo, da] = dateMatch
      receiptDate = `${yr}-${mo.padStart(2, '0')}-${da.padStart(2, '0')}`
      break
    }
  }
  // 카드 알림의 M/D 형식: "5/6", "5월 6일" 등
  if (receiptDate === today) {
    for (const line of lines) {
      const mdMatch = line.match(/(?:,\s*|\s)(\d{1,2})[/.](\d{1,2})(?:\s|$)/)
      if (mdMatch) {
        const mo = mdMatch[1].padStart(2, '0')
        const da = mdMatch[2].padStart(2, '0')
        receiptDate = `${currentYear}-${mo}-${da}`
        break
      }
      const korDateMatch = line.match(/(\d{1,2})월\s*(\d{1,2})일/)
      if (korDateMatch) {
        const mo = korDateMatch[1].padStart(2, '0')
        const da = korDateMatch[2].padStart(2, '0')
        receiptDate = `${currentYear}-${mo}-${da}`
        break
      }
    }
  }

  // 실시간 환율 가져오기
  const rates = await getExchangeRates()

  // ==========================================
  // 1단계: 카드 알림 패턴 (한국 카드사 SMS/알림)
  // ==========================================
  // 패턴: "승인 27,500원", "승인 11,000원 일시불"
  const cardKrwPattern = /승인\s*([\d,]+)\s*원/g
  let cardMatch
  const cardResults = []
  while ((cardMatch = cardKrwPattern.exec(fullText)) !== null) {
    const amt = parseInt(cardMatch[1].replace(/,/g, ''), 10)
    if (amt >= 100 && amt < 100000000) {
      // 해당 금액 주변에서 가맹점명 찾기
      const idx = cardMatch.index
      const nearby = fullText.substring(Math.max(0, idx - 100), idx + cardMatch[0].length + 100)
      // 가맹점: "주식회사XXX", 또는 금액 뒤 줄
      const storeMatch = nearby.match(/(?:주식회사|㈜|\(주\))?\s*([가-힣a-zA-Z0-9.]+(?:[가-힣a-zA-Z0-9. ]*[가-힣a-zA-Z0-9.])?)/)
      // 날짜 찾기: nearby에서 M/D 패턴
      const nearDateMatch = nearby.match(/(?:,\s*|\s)(\d{1,2})[/.](\d{1,2})/)
      let itemDate = receiptDate
      if (nearDateMatch) {
        itemDate = `${currentYear}-${nearDateMatch[1].padStart(2, '0')}-${nearDateMatch[2].padStart(2, '0')}`
      }

      let storeName = ''
      // 금액 뒤쪽 텍스트에서 가맹점 찾기
      const afterAmount = fullText.substring(idx + cardMatch[0].length, idx + cardMatch[0].length + 200)
      // "주식회사XXX" 또는 "㈜XXX" 패턴 우선
      const corpMatch = afterAmount.match(/(?:주식회사|㈜|\(주\))\s*([가-힣a-zA-Z0-9]{2,})/)
      if (corpMatch) {
        storeName = corpMatch[1].trim()
      } else {
        // 일시불, 할부, 누적, 날짜, 시간 등 제외하고 한글 가맹점명 찾기
        const skipWords = /^(일시불|할부|\d+개월|누적|승인|취소|김광민|님|네이버|현대카드|현대카드\s*M|카드|비씨|삼성|신한|국민|롯데|하나|우리|농협|기업|씨티)/
        const words = afterAmount.match(/[가-힣a-zA-Z][가-힣a-zA-Z0-9.]{1,}/g) || []
        for (const w of words) {
          if (!skipWords.test(w) && !/^\d/.test(w)) {
            storeName = w
            break
          }
        }
      }

      cardResults.push({
        category: guessCategory((storeName || '') + ' ' + nearby, categories),
        amount: amt,
        memo: storeName || '카드 승인',
        date: itemDate,
      })
    }
  }

  // 패턴: "해외승인 USD 22.00", "해외승인 JPY 1,500" 등 (다중 외화 지원)
  const FX_CURRENCIES = {
    'USD': { symbols: ['USD', 'US\\$', '\\$'], display: '$', defaultRate: 1380 },
    'JPY': { symbols: ['JPY', 'JP¥', '¥', '円'], display: '¥', defaultRate: 9.5 },
    'EUR': { symbols: ['EUR', '€'], display: '€', defaultRate: 1500 },
    'GBP': { symbols: ['GBP', '£'], display: '£', defaultRate: 1750 },
    'CNY': { symbols: ['CNY', 'RMB', '元'], display: '¥', defaultRate: 190 },
  }

  for (const [code, fx] of Object.entries(FX_CURRENCIES)) {
    const symbolGroup = fx.symbols.join('|')
    // 해외승인 + 통화코드 + 금액
    const fxPattern = new RegExp(`해외\\s*승인\\s*(?:${symbolGroup})\\s*([\\d,.]+)`, 'gi')
    let fxMatch
    while ((fxMatch = fxPattern.exec(fullText)) !== null) {
      const rawAmt = parseFloat(fxMatch[1].replace(/,/g, ''))
      if (rawAmt > 0 && rawAmt < 10000000) {
        const rate = rates[code] || fx.defaultRate
        const krwAmt = Math.round(rawAmt * rate)
        const afterFx = fullText.substring(fxMatch.index + fxMatch[0].length, fxMatch.index + fxMatch[0].length + 100)
        const shopMatch = afterFx.match(/([A-Za-z][A-Za-z0-9 .]{2,})/)
        const storeName = shopMatch ? shopMatch[1].trim() : ''
        cardResults.push({
          category: guessCategory(storeName || code, categories),
          amount: krwAmt,
          memo: `[${fx.display}${rawAmt.toLocaleString()}] ${storeName || '해외결제'}`,
          date: receiptDate,
        })
      }
    }
  }

  // 통화코드 + 금액 (해외승인 없이): "USD 22.00", "JPY 1500", "USD22.005/6" (OCR 오류 대응)
  if (cardResults.filter(r => r.memo.startsWith('[')).length === 0) {
    for (const [code, fx] of Object.entries(FX_CURRENCIES)) {
      // 통화코드 + 금액 (소수점 있을 수도, 없을 수도)
      const pattern = new RegExp(`${code}\\s*([\\d,]+\\.?\\d*)`, 'gi')
      let m
      while ((m = pattern.exec(fullText)) !== null) {
        const rawAmt = parseFloat(m[1].replace(/,/g, ''))
        if (rawAmt > 0 && rawAmt < 10000000) {
          const rate = rates[code] || fx.defaultRate
          const krwAmt = Math.round(rawAmt * rate)
          const afterM = fullText.substring(m.index + m[0].length, m.index + m[0].length + 100)
          const shopMatch = afterM.match(/([A-Za-z][A-Za-z0-9 .]{2,})/)
          const storeName = shopMatch ? shopMatch[1].trim() : ''
          cardResults.push({
            category: guessCategory(storeName || code, categories),
            amount: krwAmt,
            memo: `[${fx.display}${rawAmt.toLocaleString()}] ${storeName || '해외결제'}`,
            date: receiptDate,
          })
        }
      }
      if (cardResults.filter(r => r.memo.startsWith('[')).length > 0) break
    }
  }

  if (cardResults.length > 0) return cardResults

  // ==========================================
  // 2단계: 영수증 형태 파싱 (기존 로직)
  // ==========================================
  const foreignCurrency = detectCurrency(text)
  const currCode = foreignCurrency ? (CURRENCY_MAP[foreignCurrency] || foreignCurrency) : null
  const exchangeRate = (currCode && currCode !== 'KRW') ? (rates[currCode] || 1) : 1
  const currSymbol = currCode ? (CURRENCY_DISPLAY[currCode] || currCode) : ''

  const totalPatterns = [
    /(?:합\s*계|총\s*액|총\s*합|결제\s*금액|승인\s*금액|총\s*결제|카드\s*결제|실결제|받을\s*금액|total)\s*[:\s]*[\D]*([\d,]+\.?\d*)\s*원?/i,
    /(?:합\s*계|총\s*액|총\s*합|결제\s*금액|승인\s*금액|총\s*결제|카드\s*결제|실결제|받을\s*금액|total)\s*[:\s]*([\d,]+\.?\d*)/i,
  ]

  const foreignTotalPatterns = [
    /(?:total|amount|sum|grand\s*total|subtotal|net|charge)\s*[:\s]*[^\d]*([\d,]+\.?\d*)/i,
    /(?:合計|合计|小計|小计)\s*[:\s]*([\d,]+)/i,
  ]

  let totalAmount = 0
  let isForeign = false

  for (const line of lines) {
    for (const pattern of totalPatterns) {
      const match = line.match(pattern)
      if (match) {
        const amt = parseFloat(match[1].replace(/,/g, ''))
        if (amt > totalAmount && amt < 100000000) totalAmount = amt
      }
    }
  }

  if (totalAmount === 0 && foreignCurrency) {
    isForeign = true
    for (const line of lines) {
      for (const pattern of foreignTotalPatterns) {
        const match = line.match(pattern)
        if (match) {
          const amt = parseFloat(match[1].replace(/,/g, ''))
          if (amt > totalAmount && amt < 1000000) totalAmount = amt
        }
      }
    }
    if (totalAmount === 0) {
      const symbolPatterns = [
        /[\$€£¥]\s*([\d,]+\.?\d*)/g,
        /([\d,]+\.?\d*)\s*(?:USD|JPY|EUR|GBP|CNY|円|元|dollars?|pounds?|euros?)/gi,
      ]
      const amounts = []
      for (const pattern of symbolPatterns) {
        let m
        while ((m = pattern.exec(text)) !== null) {
          const amt = parseFloat(m[1].replace(/,/g, ''))
          if (amt > 0 && amt < 1000000) amounts.push(amt)
        }
      }
      if (amounts.length > 0) totalAmount = Math.max(...amounts)
    }
  }

  if (totalAmount > 0) {
    const category = guessCategory(text, categories)
    const storeName = lines[0]?.replace(/[^\w가-힣a-zA-Z\s]/g, '').trim().slice(0, 20) || ''
    const krwAmount = isForeign ? Math.round(totalAmount * exchangeRate) : Math.round(totalAmount)
    const memoPrefix = isForeign ? `[${currSymbol}${totalAmount.toLocaleString()}] ` : ''
    results.push({
      category,
      amount: krwAmount,
      memo: memoPrefix + (storeName || '영수증 스캔'),
      date: receiptDate
    })
    return results
  }

  // 항목별: "XX,XXX원" 금액 찾기
  const krwAmounts = []
  const krwRegex = /([\d,]+)\s*원/g
  let m
  while ((m = krwRegex.exec(fullText)) !== null) {
    const amt = parseInt(m[1].replace(/,/g, ''), 10)
    if (amt >= 100 && amt < 100000000) {
      // "누적" 금액 제외
      const before = fullText.substring(Math.max(0, m.index - 5), m.index)
      if (/누적|누적/.test(before)) continue
      krwAmounts.push(amt)
    }
  }

  if (krwAmounts.length > 0) {
    // 가장 큰 금액이 아닌, 모든 금액을 개별 항목으로
    for (const amt of krwAmounts) {
      results.push({
        category: guessCategory(text, categories),
        amount: amt,
        memo: '이미지 스캔',
        date: receiptDate,
      })
    }
    return results
  }

  // 외화 금액
  const fxPatterns = [
    /[\$€£¥]\s*([\d,]+\.?\d*)/g,
    /([\d,]+\.?\d*)\s*(?:USD|JPY|EUR|GBP|CNY|円|元)/gi,
  ]
  for (const pattern of fxPatterns) {
    while ((m = pattern.exec(text)) !== null) {
      const amt = parseFloat(m[1].replace(/,/g, ''))
      if (amt > 0 && amt < 1000000) {
        results.push({
          category: guessCategory(text, categories),
          amount: Math.round(amt * exchangeRate),
          memo: `[${currSymbol}${amt}] 이미지 스캔`,
          date: receiptDate,
        })
      }
    }
  }

  if (results.length === 0) {
    const amounts = []
    // 원화
    const krwRegex = /([\d,]{3,})\s*원/g
    let m
    while ((m = krwRegex.exec(text)) !== null) {
      const amt = parseInt(m[1].replace(/,/g, ''), 10)
      if (amt >= 100 && amt < 100000000) amounts.push({ amt, foreign: false })
    }
    // 외화
    if (amounts.length === 0) {
      const fxPatterns = [
        /[\$€£¥]\s*([\d,]+\.?\d*)/g,
        /([\d,]+\.?\d*)\s*(?:USD|JPY|EUR|GBP|CNY|円|元)/gi,
      ]
      for (const pattern of fxPatterns) {
        while ((m = pattern.exec(text)) !== null) {
          const amt = parseFloat(m[1].replace(/,/g, ''))
          if (amt > 0 && amt < 1000000) amounts.push({ amt, foreign: true })
        }
      }
    }
    if (amounts.length > 0) {
      const best = amounts.reduce((a, b) => a.amt > b.amt ? a : b)
      const krwAmt = best.foreign ? Math.round(best.amt * exchangeRate) : best.amt
      const memo = best.foreign ? `[${currSymbol}${best.amt.toLocaleString()}] 이미지 스캔` : '이미지 스캔'
      results.push({ category: guessCategory(text, categories), amount: krwAmt, memo, date: receiptDate })
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
  const [iconPickerFor, setIconPickerFor] = useState(null) // 'edit' | 'add' | null
  const [activeTab, setActiveTab] = useState('expense')
  const [analyzing, setAnalyzing] = useState(false)
  const [analyzeProgress, setAnalyzeProgress] = useState(0)
  const [analyzeResult, setAnalyzeResult] = useState(null)
  const [analyzeError, setAnalyzeError] = useState('')
  const [ocrText, setOcrText] = useState('')
  const [previewImage, setPreviewImage] = useState(null)
  const [showCloudSync, setShowCloudSync] = useState(false)
  const [cloudId, setCloudId] = useState(() => localStorage.getItem('hb-cloud-id') || '')
  const [cloudStatus, setCloudStatus] = useState('') // '', 'saving', 'saved', 'loading', 'loaded', 'error'
  const [cloudMessage, setCloudMessage] = useState('')
  const fileInputRef = useRef(null)
  const saveTimerRef = useRef(null)

  // 클라우드 자동 저장 (디바운스 3초)
  const triggerAutoSave = useCallback(() => {
    const userId = localStorage.getItem('hb-cloud-id')
    if (!userId) return
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(async () => {
      try {
        const ok = await cloudSave(userId)
        if (ok) {
          localStorage.setItem('hb-last-sync', new Date().toISOString())
          setCloudStatus('saved')
          setTimeout(() => setCloudStatus(''), 2000)
        } else {
          console.warn('Cloud auto-save returned false')
          setCloudStatus('error')
          setTimeout(() => setCloudStatus(''), 3000)
        }
      } catch (e) {
        console.error('Cloud auto-save error:', e)
        setCloudStatus('error')
        setTimeout(() => setCloudStatus(''), 3000)
      }
    }, 3000)
  }, [])

  // 수동 저장
  async function handleCloudSave() {
    const id = cloudId.trim()
    if (!id) return
    localStorage.setItem('hb-cloud-id', id)
    document.cookie = `hb-cloud-id=${encodeURIComponent(id)}; max-age=${365 * 24 * 3600}; path=/; SameSite=Strict`
    setCloudStatus('saving')
    setCloudMessage('')
    const ok = await cloudSave(id)
    if (ok) {
      localStorage.setItem('hb-last-sync', new Date().toISOString())
      setCloudStatus('saved')
      setCloudMessage('저장 완료!')
    } else {
      setCloudStatus('error')
      setCloudMessage('저장 실패. 다시 시도해주세요.')
    }
  }

  // 수동 불러오기
  async function handleCloudLoad() {
    const id = cloudId.trim()
    if (!id) return
    if (!confirm('클라우드 데이터로 덮어씌워집니다. 계속하시겠습니까?')) return
    localStorage.setItem('hb-cloud-id', id)
    setCloudStatus('loading')
    setCloudMessage('')
    const ok = await cloudRestore(id)
    if (ok) {
      setCloudStatus('loaded')
      setCloudMessage('불러오기 완료! 새로고침합니다...')
      setTimeout(() => window.location.reload(), 1000)
    } else {
      setCloudStatus('error')
      setCloudMessage('데이터가 없거나 불러오기 실패.')
    }
  }

  // 앱 시작 시 클라우드 ID 복구 + 자동 불러오기
  useEffect(() => {
    let userId = localStorage.getItem('hb-cloud-id')

    // localStorage가 삭제된 경우 → 쿠키에서 복구 시도
    if (!userId) {
      const cookieMatch = document.cookie.match(/hb-cloud-id=([^;]+)/)
      if (cookieMatch) {
        userId = decodeURIComponent(cookieMatch[1])
        localStorage.setItem('hb-cloud-id', userId)
        setCloudId(userId)
        setCloudStatus('restored')
        setTimeout(() => setCloudStatus(''), 3000)
      } else {
        return
      }
    }

    // 쿠키에 백업 (1년 유효)
    document.cookie = `hb-cloud-id=${encodeURIComponent(userId)}; max-age=${365 * 24 * 3600}; path=/; SameSite=Strict`
    ;(async () => {
      try {
        const result = await cloudLoad(userId)
        if (result && result.data) {
          // 클라우드가 더 최근이면 적용
          const localTime = localStorage.getItem('hb-last-sync') || ''
          if (result.updated_at > localTime) {
            Object.entries(result.data).forEach(([key, val]) => {
              if (val !== null && val !== undefined) {
                localStorage.setItem(key, val)
              }
            })
            localStorage.setItem('hb-last-sync', result.updated_at)
            window.location.reload()
          }
        }
      } catch (e) {
        console.error('Auto cloud restore failed:', e)
      }
    })()
  }, [])

  useEffect(() => {
    localStorage.setItem('household-book', JSON.stringify(entries))
    triggerAutoSave()
  }, [entries, triggerAutoSave])

  useEffect(() => {
    localStorage.setItem('household-book-categories', JSON.stringify(categories))
    triggerAutoSave()
  }, [categories, triggerAutoSave])

  useEffect(() => {
    localStorage.setItem('household-book-icons', JSON.stringify(categoryIcons))
    triggerAutoSave()
  }, [categoryIcons, triggerAutoSave])

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
        // base64 데이터 추출
        const base64 = dataUrl.split(',')[1]
        setAnalyzeProgress(30)

        // Google Cloud Vision API 호출
        const response = await fetch(
          `https://vision.googleapis.com/v1/images:annotate?key=${VISION_API_KEY}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              requests: [{
                image: { content: base64 },
                features: [{ type: 'TEXT_DETECTION' }],
                imageContext: { languageHints: ['ko', 'en'] }
              }]
            })
          }
        )

        setAnalyzeProgress(70)
        const result = await response.json()

        if (result.error) {
          throw new Error(result.error.message)
        }

        const textAnnotations = result.responses?.[0]?.textAnnotations
        const text = textAnnotations?.[0]?.description || ''
        setOcrText(text)
        setAnalyzeProgress(90)

        if (!text.trim()) {
          setAnalyzeError('이미지에서 텍스트를 찾을 수 없습니다.')
          return
        }

        const results = await parseReceiptText(text, categories)
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
          <h1>가계부 <span className="app-version">v2.4</span></h1>
          <div className="header-btns">
            {cloudStatus === 'saved' && <span className="cloud-indicator saved">☁️✓</span>}
            {cloudStatus === 'error' && <span className="cloud-indicator error">☁️✗</span>}
            <button className="settings-btn" onClick={() => setShowCloudSync(true)}>☁️</button>
            <button className="settings-btn" onClick={() => setShowCategoryManager(true)}>⚙️</button>
          </div>
        </div>
        <div className="tab-nav">
          <button className={`tab-btn ${activeTab === 'expense' ? 'active' : ''}`} onClick={() => setActiveTab('expense')}>지출</button>
          <button className={`tab-btn ${activeTab === 'work' ? 'active' : ''}`} onClick={() => setActiveTab('work')}>근무/수입</button>
        </div>
      </header>

      {activeTab === 'work' && (
        <WorkTab currentMonth={currentMonth} changeMonth={changeMonth} monthLabel={monthLabel} onDataChange={triggerAutoSave} />
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

      <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleImageUpload} />

      <div className="fab-group">
        <button className="fab scan-fab" onClick={() => fileInputRef.current?.click()}>🖼️</button>
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
        <div className="modal-overlay" onClick={() => { setShowCategoryManager(false); setEditingCat(null); setIconPickerFor(null) }}>
          <div className="modal category-modal" onClick={e => e.stopPropagation()}>
            <h3>카테고리 관리</h3>
            <div className="cat-list">
              {categories.map((cat, idx) => (
                <div key={cat} className="cat-item">
                  {editingCat?.original === cat ? (
                    <div className="cat-edit-form">
                      <div className="cat-edit-row">
                        <button type="button" className="icon-picker-btn" onClick={() => setIconPickerFor(iconPickerFor === 'edit' ? null : 'edit')}>{editingCat.icon}</button>
                        <input className="cat-edit-input" value={editingCat.name} onChange={e => setEditingCat(prev => ({ ...prev, name: e.target.value }))} autoFocus />
                        <button type="button" className="cat-btn save" onClick={() => { saveEditCategory(); setIconPickerFor(null) }}>저장</button>
                        <button type="button" className="cat-btn" onClick={() => { setEditingCat(null); setIconPickerFor(null) }}>취소</button>
                      </div>
                      {iconPickerFor === 'edit' && (
                        <div className="icon-grid">
                          {ICON_OPTIONS.map(ic => (
                            <button key={ic} type="button" className={`icon-grid-item${editingCat.icon === ic ? ' selected' : ''}`} onClick={() => { setEditingCat(prev => ({ ...prev, icon: ic })); setIconPickerFor(null) }}>{ic}</button>
                          ))}
                        </div>
                      )}
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
              <div className="cat-add-row">
                <button type="button" className="icon-picker-btn" onClick={() => setIconPickerFor(iconPickerFor === 'add' ? null : 'add')}>{newCatIcon}</button>
                <input className="cat-add-input" placeholder="새 카테고리 이름" value={newCatName} onChange={e => setNewCatName(e.target.value)} onKeyDown={e => e.key === 'Enter' && addCategory()} />
                <button className="cat-btn add" onClick={() => { addCategory(); setIconPickerFor(null) }}>추가</button>
              </div>
              {iconPickerFor === 'add' && (
                <div className="icon-grid">
                  {ICON_OPTIONS.map(ic => (
                    <button key={ic} type="button" className={`icon-grid-item${newCatIcon === ic ? ' selected' : ''}`} onClick={() => { setNewCatIcon(ic); setIconPickerFor(null) }}>{ic}</button>
                  ))}
                </div>
              )}
            </div>
            <div className="form-actions">
              <button type="button" className="save-btn" onClick={() => { setShowCategoryManager(false); setEditingCat(null) }}>완료</button>
            </div>
          </div>
        </div>
      )}

      {showCloudSync && (
        <div className="modal-overlay" onClick={() => setShowCloudSync(false)}>
          <div className="modal cloud-modal" onClick={e => e.stopPropagation()}>
            <h3>☁️ 클라우드 동기화</h3>
            <p className="cloud-desc">
              나만의 ID를 정하면 데이터가 자동으로 클라우드에 저장됩니다.<br/>
              다른 기기에서 같은 ID로 불러오기하면 데이터를 복원할 수 있어요.
            </p>
            <label>
              내 동기화 ID
              <input
                type="text"
                placeholder="예: myfamily2024"
                value={cloudId}
                onChange={e => setCloudId(e.target.value)}
              />
            </label>
            {cloudMessage && (
              <p className={`cloud-msg ${cloudStatus === 'error' ? 'error' : 'success'}`}>
                {cloudMessage}
              </p>
            )}
            <div className="cloud-actions">
              <button
                className="cloud-btn save"
                onClick={handleCloudSave}
                disabled={!cloudId.trim() || cloudStatus === 'saving'}
              >
                {cloudStatus === 'saving' ? '저장 중...' : '☁️ 저장하기'}
              </button>
              <button
                className="cloud-btn load"
                onClick={handleCloudLoad}
                disabled={!cloudId.trim() || cloudStatus === 'loading'}
              >
                {cloudStatus === 'loading' ? '불러오는 중...' : '📥 불러오기'}
              </button>
            </div>
            {cloudId && localStorage.getItem('hb-cloud-id') === cloudId.trim() && (
              <p className="cloud-auto-hint">✅ 자동 저장이 활성화되어 있습니다</p>
            )}
            <div className="form-actions">
              <button type="button" className="save-btn" onClick={() => setShowCloudSync(false)}>닫기</button>
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
