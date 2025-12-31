import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

export const supabase = createClient(
  "https://dtzhherpazjfvxxyfaex.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR0emhoZXJwYXpqZnZ4eHlmYWV4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYzNjc0MzIsImV4cCI6MjA4MTk0MzQzMn0.a7GqIrwfCJB1H0iMcyZy-LAjBwYw93yuPyoE1Ft_-Mg"
);
