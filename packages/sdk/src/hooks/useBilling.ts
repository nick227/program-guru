import { useQuery } from '@tanstack/react-query'
import { apiData, getApiClient } from '../client'
import { queryKeys as keys } from '../queryKeys'
import { useViewerKey } from './viewerKey'

export function useCreatorEarnings() {
  return useQuery({
    queryKey: useViewerKey(keys.earnings),
    queryFn: async ({ signal }) =>
      apiData(await getApiClient().GET('/billing/earnings', { signal })).data,
  })
}

export function usePayoutAccount() {
  return useQuery({
    queryKey: useViewerKey(keys.payoutAccount),
    queryFn: async ({ signal }) =>
      apiData(await getApiClient().GET('/billing/payout-account', { signal }))
        .data,
  })
}
