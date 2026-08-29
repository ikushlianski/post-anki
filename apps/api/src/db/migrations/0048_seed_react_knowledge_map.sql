-- Reference-data migration: seeds the /frontend/react knowledge-map slots
-- (source: 'static_taxonomy', same convention as it-taxonomy.yaml). Derived
-- from react.dev/learn's four chapters, collapsed to the altitude of one
-- knowledge-map node per well-known React topic, with "state" folded into
-- "props" per user request. Idempotent (existence-checked per node) and
-- self-sufficient: creates the Web Development > Frontend Development >
-- Frontend Frameworks ancestor chain if it isn't seeded in this environment
-- yet, rather than assuming seed-domain-taxonomy.ts already ran.
DO $$
DECLARE
  v_subject_id text;
  v_web_dev_id text;
  v_frontend_dev_id text;
  v_frontend_frameworks_id text;
  v_react_id text;
BEGIN
  SELECT id INTO v_subject_id FROM subjects WHERE name = 'Programming / Web Development' LIMIT 1;

  IF v_subject_id IS NULL THEN
    RAISE NOTICE 'seed_react_knowledge_map: no "Programming / Web Development" subject found — skipping';
    RETURN;
  END IF;

  SELECT id INTO v_web_dev_id FROM domain_nodes
    WHERE subject_id = v_subject_id AND parent_id IS NULL AND name = 'Web Development'
    LIMIT 1;
  IF v_web_dev_id IS NULL THEN
    v_web_dev_id := 'dnode_' || gen_random_uuid();
    INSERT INTO domain_nodes (id, subject_id, parent_id, name, description, "order", source)
    VALUES (v_web_dev_id, v_subject_id, NULL, 'Web Development', 'Web technologies, frameworks, and full-stack development', 0, 'static_taxonomy');
  END IF;

  SELECT id INTO v_frontend_dev_id FROM domain_nodes
    WHERE subject_id = v_subject_id AND parent_id = v_web_dev_id AND name = 'Frontend Development'
    LIMIT 1;
  IF v_frontend_dev_id IS NULL THEN
    v_frontend_dev_id := 'dnode_' || gen_random_uuid();
    INSERT INTO domain_nodes (id, subject_id, parent_id, name, description, "order", source)
    VALUES (v_frontend_dev_id, v_subject_id, v_web_dev_id, 'Frontend Development', 'Client-side web development', 0, 'static_taxonomy');
  END IF;

  SELECT id INTO v_frontend_frameworks_id FROM domain_nodes
    WHERE subject_id = v_subject_id AND parent_id = v_frontend_dev_id AND name = 'Frontend Frameworks'
    LIMIT 1;
  IF v_frontend_frameworks_id IS NULL THEN
    v_frontend_frameworks_id := 'dnode_' || gen_random_uuid();
    INSERT INTO domain_nodes (id, subject_id, parent_id, name, description, "order", source)
    VALUES (v_frontend_frameworks_id, v_subject_id, v_frontend_dev_id, 'Frontend Frameworks', 'React, Vue, Angular, and framework concepts', 1, 'static_taxonomy');
  END IF;

  SELECT id INTO v_react_id FROM domain_nodes
    WHERE subject_id = v_subject_id AND parent_id = v_frontend_frameworks_id AND name = 'React'
    LIMIT 1;
  IF v_react_id IS NULL THEN
    v_react_id := 'dnode_' || gen_random_uuid();
    INSERT INTO domain_nodes (id, subject_id, parent_id, name, description, "order", source)
    VALUES (v_react_id, v_subject_id, v_frontend_frameworks_id, 'React', 'React library — component model, state, and the effect system, per react.dev/learn', 0, 'static_taxonomy');
  END IF;

  INSERT INTO domain_nodes (id, subject_id, parent_id, name, description, "order", source)
  SELECT 'dnode_' || gen_random_uuid(), v_subject_id, v_react_id, x.name, x.description, x.ord, 'static_taxonomy'
  FROM (VALUES
    ('Components & JSX', 'Defining components and writing markup with JSX', 0),
    ('Props and State', 'Passing data into a component and letting a component remember its own data over time', 1),
    ('Conditional Rendering', 'Rendering different markup depending on a condition', 2),
    ('Rendering Lists', 'Rendering a collection of components from an array', 3),
    ('Component Purity & UI as a Tree', 'Components as pure functions, and the resulting tree structure of a React UI', 4),
    ('Handling Events', 'Responding to user-initiated events', 5),
    ('Updating Objects & Arrays in State', 'Treating state as immutable when it holds an object or array', 6),
    ('Sharing State Between Components', 'Lifting state up to a common parent so sibling components can share it', 7),
    ('Reducers', 'Consolidating complex state-update logic into a single function', 8),
    ('Context', 'Passing data through the component tree without prop drilling', 9),
    ('Refs & the DOM', 'Referencing values and DOM elements without triggering a re-render', 10),
    ('Effects', 'Synchronizing a component with an external system, and the effect lifecycle', 11),
    ('Custom Hooks', 'Extracting and reusing stateful logic across components', 12)
  ) AS x(name, description, ord)
  WHERE NOT EXISTS (
    SELECT 1 FROM domain_nodes dn
    WHERE dn.subject_id = v_subject_id AND dn.parent_id = v_react_id AND dn.name = x.name
  );
END $$;
