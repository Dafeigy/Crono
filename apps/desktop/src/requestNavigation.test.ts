import { describe, expect, it } from "vitest";
import { orderRequestsForNavigation } from "./requestNavigation";

describe("request keyboard navigation order", () => {
  it("matches the sidebar tree order", () => {
    const folders = [
      { id: "folder-b", sortPriority: 20 },
      { id: "folder-a", sortPriority: 10 },
    ];
    const requests = [
      { id: "b-2", folderId: "folder-b", sortPriority: 22 },
      { id: "root-2", folderId: null, sortPriority: 2 },
      { id: "a-1", folderId: "folder-a", sortPriority: 11 },
      { id: "root-1", folderId: null, sortPriority: 1 },
      { id: "b-1", folderId: "folder-b", sortPriority: 21 },
    ];

    expect(
      orderRequestsForNavigation(requests, folders).map(({ id }) => id),
    ).toEqual(["root-1", "root-2", "a-1", "b-1", "b-2"]);
  });

  it("keeps requests from missing folders reachable", () => {
    const requests = [
      { id: "orphan", folderId: "missing", sortPriority: 1 },
      { id: "root", folderId: null, sortPriority: 2 },
    ];

    expect(
      orderRequestsForNavigation(requests, []).map(({ id }) => id),
    ).toEqual(["root", "orphan"]);
  });
});
