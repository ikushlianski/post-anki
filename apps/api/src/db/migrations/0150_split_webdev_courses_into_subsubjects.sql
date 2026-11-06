DO $$
DECLARE
  webdev_id text;
  programming_id text;
  course record;
  child_id text;
  tbl record;
  in_use boolean := false;
  hits integer;
BEGIN
  SELECT id INTO webdev_id FROM subjects WHERE name = 'Webdev' AND parent_id IS NULL ORDER BY created_at LIMIT 1;

  IF webdev_id IS NOT NULL THEN
    FOR course IN SELECT id, name FROM curricula WHERE subject_id = webdev_id LOOP
      SELECT id INTO child_id FROM subjects WHERE parent_id = webdev_id AND name = course.name LIMIT 1;

      IF child_id IS NULL THEN
        child_id := 'sub_' || gen_random_uuid()::text;

        INSERT INTO subjects (id, name, kind, require_sources, parent_id)
        SELECT child_id, course.name, kind, require_sources, webdev_id FROM subjects WHERE id = webdev_id;
      END IF;

      UPDATE curricula SET subject_id = child_id, category_id = NULL WHERE id = course.id;
      DELETE FROM curriculum_domain_node_mappings WHERE curriculum_id = course.id;
    END LOOP;
  END IF;

  SELECT id INTO programming_id FROM subjects WHERE name = 'Programming / Web Development' AND parent_id IS NULL ORDER BY created_at LIMIT 1;

  IF programming_id IS NOT NULL THEN
    SELECT EXISTS (SELECT 1 FROM subjects WHERE parent_id = programming_id) INTO in_use;

    IF NOT in_use THEN
      FOR tbl IN
        SELECT table_name FROM information_schema.columns
        WHERE table_schema = current_schema() AND column_name = 'subject_id'
          AND table_name NOT IN ('subject_categories', 'subjects')
      LOOP
        EXECUTE format('SELECT count(*) FROM %I WHERE subject_id = $1', tbl.table_name) INTO hits USING programming_id;

        IF hits > 0 THEN
          in_use := true;
        END IF;
      END LOOP;
    END IF;

    IF NOT in_use THEN
      DELETE FROM subject_categories WHERE subject_id = programming_id;
      DELETE FROM subjects WHERE id = programming_id;
    END IF;
  END IF;
END $$;
