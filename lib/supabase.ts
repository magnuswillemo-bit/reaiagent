import { createClient } from '@supabase/supabase-js'

// These lines grab the secret keys you saved in .env.local
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// This creates the permanent connection we will use throughout the app
export const supabase = createClient(supabaseUrl, supabaseAnonKey)