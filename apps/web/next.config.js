/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001',
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://fuypijdvmranrmapstnb.supabase.co',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ1eXBpamR2bXJhbnJtYXBzdG5iIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ5Njk0OTMsImV4cCI6MjA5MDU0NTQ5M30.et-uQnyByZl7WRoRjOHAmTg6kz4iqFW4GLFwqfLvCvs',
  },
}

module.exports = nextConfig
