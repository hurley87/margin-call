-- Tighten deal outcome copy: short narrative + concise gained-asset labels in JSON.
update public.system_prompts
set
  content = content
    || E'\n\nLABEL RULES (JSON):\n- narrative: 2-3 short sentences, no extra subplot.\n- assets_gained[].name: 2-3 words only, no parentheses.\n- assets_lost: exact strings from INVENTORY as given (for matching).',
  updated_at = now()
where name = 'deal_outcome';
