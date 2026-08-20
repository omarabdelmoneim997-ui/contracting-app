import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://pywkkzedqqgmaghdqxba.supabase.co";
const SUPABASE_KEY = "sb_publishable_NdCF4PCw-OVWa0YwIfMVPA_y0IoJTLF";

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
