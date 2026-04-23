// ============================================
// STUDY AURA — CONFIG
// Replace these with your actual Supabase credentials
// ============================================

const SUPABASE_URL = 'https://biqdrsqirzxnznyucwtz.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJpcWRyc3Fpcnp4bnpueXVjd3R6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY4Njk1MDgsImV4cCI6MjA5MjQ0NTUwOH0.fiPASLwVmwemIPqLaMcXoqGsa7P0Oa17vp3SUymPqG0';

// Admin email — only this user sees the admin notification panel
const ADMIN_EMAIL = 'hackernfa@gmail.com';

// Initialize Supabase
const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Global state
let currentUser = null;
let currentProfile = null;