-- مستويات تحت بعض للبنود الفرعية: بند العمل ← مستوى ← مستوى تحته ← ...
-- شغّله مرة واحدة من Supabase → SQL Editor. البنود الفرعية الموجودة بتفضل زي ما هي (مستوى أول).

alter table work_item_levels
  add column if not exists parent_id text references work_item_levels(id) on delete cascade;

-- الاسم بقى فريد تحت نفس الأب بس (عشان ينفع "مصنعيات" تتكرر تحت مستويين مختلفين)
do $$
declare c record;
begin
  for c in select conname from pg_constraint
           where conrelid = 'work_item_levels'::regclass and contype = 'u' loop
    execute format('alter table work_item_levels drop constraint %I', c.conname);
  end loop;
  for c in select i.relname from pg_index x join pg_class i on i.oid = x.indexrelid
           where x.indrelid = 'work_item_levels'::regclass and x.indisunique and not x.indisprimary loop
    execute format('drop index if exists %I', c.relname);
  end loop;
end $$;

create unique index if not exists work_item_levels_parent_name_uniq
  on work_item_levels (work_item_id, coalesce(parent_id, ''), name);
