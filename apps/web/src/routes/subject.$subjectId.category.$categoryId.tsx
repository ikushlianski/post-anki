import { Link, createFileRoute } from '@tanstack/react-router'

import { resolveCategoryPath } from '@post-anki/core'
import { getBoard } from '../curriculum/curriculum.api'
import { CreateMaterialForm } from '../subject/create-material-form'
import { CurriculumRowActions } from '../subject/subject-section'

export const Route = createFileRoute('/subject/$subjectId/category/$categoryId')({
  component: CategoryDetailPage,
  loader: async ({ params }) => {
    const board = await getBoard()
    const subject = board.subjects.find((s) => s.id === params.subjectId) ?? null
    const subjectCategories = board.categories.filter((c) => c.subjectId === params.subjectId)
    const category = subjectCategories.find((c) => c.id === params.categoryId) ?? null

    return {
      subject,
      category,
      breadcrumb: category ? resolveCategoryPath(category.id, subjectCategories) : [],
      childCategories: subjectCategories.filter((c) => c.parentId === params.categoryId),
      childCurricula: board.curricula.filter(
        (c) => c.subjectId === params.subjectId && c.categoryId === params.categoryId,
      ),
      // Scoped to this subject — CreateMaterialForm's own tree-position
      // picker must never offer a different subject's categories
      // (SCENARIO 5).
      categories: subjectCategories,
      // The FULL cross-subject list — CurriculumRowActions' move control
      // needs every subject's categories so a cross-subject move can still
      // offer the target subject's own categories (SCENARIO 8), the same
      // way subject.$subjectId.tsx's own `allCategories` does.
      allCategories: board.categories,
      allSubjects: board.subjects,
    }
  },
})

function CategoryDetailPage() {
  const {
    subject,
    category,
    breadcrumb,
    childCategories,
    childCurricula,
    categories,
    allCategories,
    allSubjects,
  } = Route.useLoaderData()

  if (!subject || !category) {
    return (
      <main className="mx-auto max-w-3xl px-5 py-8 sm:px-8 sm:py-10">
        <p className="text-sm text-neutral-500">Category not found.</p>
        <Link to="/" className="text-sm underline">
          Back to dashboard
        </Link>
      </main>
    )
  }

  return (
    <main className="mx-auto max-w-3xl px-5 py-8 sm:px-8 sm:py-10">
      <nav className="text-sm text-neutral-500" data-testid="category-breadcrumb">
        <Link to="/" className="hover:text-neutral-900">
          All subjects
        </Link>
        {' / '}
        <Link
          to="/subject/$subjectId"
          params={{ subjectId: subject.id }}
          className="hover:text-neutral-900"
        >
          {subject.name}
        </Link>
        {breadcrumb.map((entry) => (
          <span key={entry.id}>
            {' / '}
            <span data-testid={`category-breadcrumb-${entry.id}`}>{entry.name}</span>
          </span>
        ))}
      </nav>

      <header className="mb-6 mt-3">
        <h1 className="text-2xl font-semibold tracking-tight">{category.name}</h1>
      </header>

      {childCategories.length > 0 ? (
        <ul className="mb-3 space-y-2" data-testid="category-child-categories">
          {childCategories.map((child) => (
            <li key={child.id}>
              <Link
                to="/subject/$subjectId/category/$categoryId"
                params={{ subjectId: subject.id, categoryId: child.id }}
                data-testid={`category-link-${child.id}`}
                className="flex items-center justify-between card-compact hover:border-neutral-400"
              >
                <span className="text-sm font-medium">📁 {child.name}</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}

      <ul className="mb-3 space-y-2" data-testid="category-child-curricula">
        {childCurricula.length === 0 && childCategories.length === 0 ? (
          <li className="text-sm text-neutral-400">No curricula yet.</li>
        ) : (
          childCurricula.map((curriculum) => (
            <li key={curriculum.id} className="flex items-center gap-2">
              <Link
                to="/curriculum/$curriculumId"
                params={{ curriculumId: curriculum.id }}
                data-testid="curriculum-name"
                className="flex flex-1 items-center justify-between card-compact hover:border-neutral-400"
              >
                {curriculum.name}
              </Link>
              <CurriculumRowActions
                curriculum={curriculum}
                allCurricula={childCurricula}
                allSubjects={allSubjects}
                allCategories={allCategories}
              />
            </li>
          ))
        )}
      </ul>

      <CreateMaterialForm
        subjectId={subject.id}
        subjectName={subject.name}
        requireSources={subject.requireSources}
        categories={categories}
        defaultSelectedNodeId={category.id}
      />
    </main>
  )
}
