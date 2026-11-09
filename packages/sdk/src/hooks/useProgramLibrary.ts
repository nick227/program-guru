import { useQuery } from '@tanstack/react-query'
import { apiData, getApiClient } from '../client'
import { useViewerKey } from './viewerKey'
import { useApiMutation } from './mutation'

export function useProgramLibrary() {
  return useQuery({
    queryKey: useViewerKey(['programs', 'personal-library']),
    queryFn: async ({ signal }) =>
      apiData(await getApiClient().GET('/me/program-library', { signal })).data,
  })
}
export function useManagePersonalProgram() {
  return useApiMutation(
    async ({
      programId,
      action,
      expectedRunId,
    }: {
      programId: string
      expectedRunId?: string
      action: 'ARCHIVE' | 'RESTORE' | 'RESTART'
    }) =>
      apiData(
        await getApiClient().POST('/me/program-library/{programId}', {
          params: { path: { programId } },
          body: { action, expectedRunId },
        }),
      ).data,
    [
      ['programs', 'personal-library'],
      ['enrollments'],
      ['calendar'],
      ['programs'],
    ],
  )
}
export function usePersonalEnrollmentAction() {
  return useApiMutation(
    async ({
      id,
      action,
    }: {
      id: string
      action: 'ACTIVE' | 'PAUSED' | 'REMOVE'
    }) =>
      action === 'REMOVE'
        ? apiData(
            await getApiClient().POST('/enrollments/{enrollmentId}/leave', {
              params: { path: { enrollmentId: id } },
              body: { futureItems: 'REMOVE' },
            }),
          ).data
        : apiData(
            await getApiClient().PATCH('/enrollments/{enrollmentId}', {
              params: { path: { enrollmentId: id } },
              body: { status: action },
            }),
          ).data,
    [
      ['programs', 'personal-library'],
      ['enrollments'],
      ['calendar'],
      ['programs'],
    ],
  )
}
