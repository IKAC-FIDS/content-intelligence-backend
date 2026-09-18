import { PaginationMetaDto } from './pagination.meta';

export function createPaginationMeta(
  page: number,
  limit: number,
  total: number,
) {
  return new PaginationMetaDto(page, limit, total);
}

export function getPaginationOffset(page = 1, limit = 20) {
  return {
    skip: (page - 1) * limit,
    take: limit,
  };
}
