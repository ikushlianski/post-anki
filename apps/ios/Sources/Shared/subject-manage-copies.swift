import PostAnkiAPI

extension SubjectManageSubject {
    func with(name: String? = nil, parentId: String?? = nil, sortOrder: Int?? = nil) -> SubjectManageSubject {
        SubjectManageSubject(
            id: id,
            name: name ?? self.name,
            kind: kind,
            parentId: parentId ?? self.parentId,
            sortOrder: sortOrder ?? self.sortOrder,
            cardCount: cardCount
        )
    }
}

extension SubjectManageCourse {
    func with(subjectId: String? = nil, categoryId: String?? = nil) -> SubjectManageCourse {
        SubjectManageCourse(
            id: id,
            subjectId: subjectId ?? self.subjectId,
            name: name,
            status: status,
            categoryId: categoryId ?? self.categoryId
        )
    }
}

extension SubjectCategory {
    func with(name: String? = nil, parentId: String?? = nil) -> SubjectCategory {
        SubjectCategory(id: id, subjectId: subjectId, parentId: parentId ?? self.parentId, name: name ?? self.name)
    }
}
