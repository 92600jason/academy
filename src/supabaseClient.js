import { createClient } from '@supabase/supabase-js'

// import.meta.env 대신 직접 주소와 키를 넣어 테스트
const supabaseUrl = 'https://wmwyzkhrddlmuvojtope.supabase.co'
const supabaseAnonKey = 'sb_publishable_DoZ_zf1nPKVMoELRS_YpWQ_OADNq92q'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)