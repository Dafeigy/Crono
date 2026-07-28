interface NavigableFolder {
  id: string;
  sortPriority: number;
}

interface NavigableRequest {
  folderId: string | null;
  sortPriority: number;
}

export function orderRequestsForNavigation<T extends NavigableRequest>(
  requests: T[],
  folders: NavigableFolder[],
) {
  const sortedRequests = [...requests].sort(
    (left, right) => left.sortPriority - right.sortPriority,
  );
  const sortedFolders = [...folders].sort(
    (left, right) => left.sortPriority - right.sortPriority,
  );
  const knownFolderIds = new Set(sortedFolders.map(({ id }) => id));

  return [
    ...sortedRequests.filter(({ folderId }) => folderId === null),
    ...sortedFolders.flatMap(({ id }) =>
      sortedRequests.filter(({ folderId }) => folderId === id),
    ),
    ...sortedRequests.filter(
      ({ folderId }) => folderId !== null && !knownFolderIds.has(folderId),
    ),
  ];
}
