import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://aepionwxmpriiuvnzdmu.supabase.co'
const SUPABASE_ANON_KEY = 'sb_publishable_eKp_FmMZGU0f4Pfkir5Xxg_87rhoJPM'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

// localStorage 키 목록 (동기화 대상)
const SYNC_KEYS = [
  'household-book',
  'household-book-categories',
  'household-book-icons',
  'hb-hourly-wage',
  'hb-overtime-base',
  'hb-overtime-rate',
  'hb-work-logs',
  'hb-deductions',
  'hb-cloud-id',
]

// 디바이스 고유 ID (첫 실행 시 생성)
function getDeviceId() {
  let id = localStorage.getItem('hb-device-id')
  if (!id) {
    id = crypto.randomUUID()
    localStorage.setItem('hb-device-id', id)
  }
  return id
}

// 모든 localStorage 데이터를 하나의 객체로 수집
function collectLocalData() {
  const data = {}
  SYNC_KEYS.forEach(key => {
    const val = localStorage.getItem(key)
    if (val !== null) data[key] = val
  })
  return data
}

// Supabase에서 가져온 데이터를 localStorage에 적용
function applyToLocal(data) {
  if (!data || typeof data !== 'object') return
  Object.entries(data).forEach(([key, val]) => {
    if (SYNC_KEYS.includes(key) && val !== null && val !== undefined) {
      localStorage.setItem(key, val)
    }
  })
}

// 클라우드에서 데이터 로드
export async function cloudLoad(userId) {
  try {
    const { data, error } = await supabase
      .from('app_data')
      .select('data, updated_at')
      .eq('id', userId)
      .single()

    if (error) {
      if (error.code === 'PGRST116') return null // not found
      console.error('Cloud load error:', error)
      return null
    }
    return data
  } catch (e) {
    console.error('Cloud load failed:', e)
    return null
  }
}

// 클라우드에 데이터 저장
export async function cloudSave(userId) {
  try {
    const localData = collectLocalData()
    const { error } = await supabase
      .from('app_data')
      .upsert({
        id: userId,
        data: localData,
        updated_at: new Date().toISOString(),
      })

    if (error) {
      console.error('Cloud save error:', error)
      return false
    }
    return true
  } catch (e) {
    console.error('Cloud save failed:', e)
    return false
  }
}

// 클라우드에서 불러와서 localStorage에 적용
export async function cloudRestore(userId) {
  const result = await cloudLoad(userId)
  if (result && result.data) {
    applyToLocal(result.data)
    return true
  }
  return false
}

// 자동 동기화: 변경 감지 시 저장 (디바운스)
let saveTimer = null
export function autoSync(userId) {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    cloudSave(userId)
  }, 2000) // 2초 디바운스
}
