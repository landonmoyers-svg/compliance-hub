"use client";

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from "@tanstack/react-query";
import { db } from "./index";
import type { CollectionName, DataClient } from "./client";

type ItemOf<K extends CollectionName> = Awaited<
  ReturnType<DataClient[K]["list"]>
>[number];

/** Read a whole collection as a React Query. Returns [] until loaded. */
export function useCollection<K extends CollectionName>(
  name: K,
): UseQueryResult<ItemOf<K>[]> {
  return useQuery({
    queryKey: [name],
    queryFn: () =>
      (db()[name] as DataClient[K]).list() as Promise<ItemOf<K>[]>,
  });
}

/** Create a record in a collection and refresh its query on success. */
export function useCreate<K extends CollectionName>(name: K) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Omit<ItemOf<K>, "id" | "createdDate">) =>
      (db()[name] as DataClient[K]).create(
        input as never,
      ) as Promise<ItemOf<K>>,
    onSuccess: () => qc.invalidateQueries({ queryKey: [name] }),
  });
}

/** Update a record in a collection and refresh its query on success. */
export function useUpdate<K extends CollectionName>(name: K) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      patch,
    }: {
      id: string;
      patch: Partial<Omit<ItemOf<K>, "id" | "createdDate">>;
    }) =>
      (db()[name] as DataClient[K]).update(
        id,
        patch as never,
      ) as Promise<ItemOf<K>>,
    onSuccess: () => qc.invalidateQueries({ queryKey: [name] }),
  });
}
