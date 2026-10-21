import { createSlice } from '@reduxjs/toolkit'

/**
 * filtersSlice — persists user filter preferences across page navigation.
 *
 * selectedReleaseId  (number | null)  — shared by Dashboard and BudgetTracker
 * productVersion     (string)         — shared by DeliveryMetrics and ReleaseStatus; '' = all
 * selectedEngineer   (string)         — shared by DeliveryMetrics and BudgetTracker; '' = all
 */
const filtersSlice = createSlice({
  name: 'filters',
  initialState: {
    selectedReleaseId: null,
    productVersion: '',
    selectedEngineer: '',
  },
  reducers: {
    setSelectedReleaseId(state, action) {
      state.selectedReleaseId = action.payload
    },
    setProductVersion(state, action) {
      state.productVersion = action.payload
    },
    setSelectedEngineer(state, action) {
      state.selectedEngineer = action.payload
    },
  },
})

export const { setSelectedReleaseId, setProductVersion, setSelectedEngineer } = filtersSlice.actions
export default filtersSlice.reducer
