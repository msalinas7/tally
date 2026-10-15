import { createSlice } from '@reduxjs/toolkit'

/**
 * filtersSlice — persists user filter preferences across page navigation.
 *
 * selectedReleaseId  (number | null)  — shared by Dashboard and BudgetTracker
 * productVersion     (string)         — shared by DeliveryMetrics; '' = all
 */
const filtersSlice = createSlice({
  name: 'filters',
  initialState: {
    selectedReleaseId: null,
    productVersion: '',
  },
  reducers: {
    setSelectedReleaseId(state, action) {
      state.selectedReleaseId = action.payload
    },
    setProductVersion(state, action) {
      state.productVersion = action.payload
    },
  },
})

export const { setSelectedReleaseId, setProductVersion } = filtersSlice.actions
export default filtersSlice.reducer
