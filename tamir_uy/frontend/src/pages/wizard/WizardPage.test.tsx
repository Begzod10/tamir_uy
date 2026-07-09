import * as React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import WizardPage from './WizardPage'
import { useRoomStore } from '@/store/roomStore'

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('@/lib/api', () => ({
  createApartment: vi.fn().mockResolvedValue({ id: 'apt-1', name: 'Test', total_area: 20, address: null, created_at: '' }),
  createRoom: vi.fn().mockResolvedValue({
    id: 'room-1',
    apartment_id: 'apt-1',
    name: 'Xona',
    room_type: 'mehmonxona',
    area: 12,
    ceiling_height: 2.7,
    width: 3,
    length: 4,
    num_doors: 0,
    num_windows: 0,
    has_balcony: false,
    renovation_level: 'orta',
    design_state: {},
    created_at: '',
  }),
}))

// framer-motion: render children immediately without animations
vi.mock('framer-motion', async () => {
  const actual = await vi.importActual<typeof import('framer-motion')>('framer-motion')
  return {
    ...actual,
    motion: new Proxy({} as Record<string, unknown>, {
      get: (_t, tag: string) =>
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ({ children, ...props }: any) => {
          return React.createElement(tag, props, children)
        },
    }),
    AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
  }
})

// ─── Helpers ──────────────────────────────────────────────────────────────────

function renderWizard() {
  return render(
    <MemoryRouter>
      <WizardPage />
    </MemoryRouter>,
  )
}

// Reset store before each test
beforeEach(() => {
  useRoomStore.setState({
    roomId: null,
    apartmentId: null,
    name: 'Xona',
    ceilingHeight: 2700,
    geometry: {
      walls: [
        { id: 'A', length: 4000, elements: [] },
        { id: 'B', length: 3000, elements: [] },
        { id: 'C', length: 4000, elements: [] },
        { id: 'D', length: 3000, elements: [] },
      ],
    },
    surfaces: {},
    furniture: [],
    isDirty: false,
  } as Parameters<typeof useRoomStore.setState>[0])
})

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('WizardPage – Step 0', () => {
  it('renders ceiling height presets', () => {
    renderWizard()
    expect(screen.getByText('Shiftning balandligi?')).toBeTruthy()
    expect(screen.getByText('2.5 m')).toBeTruthy()
    expect(screen.getByText('2.7 m')).toBeTruthy()
    expect(screen.getByText('3.0 m')).toBeTruthy()
    expect(screen.getByText('3.2 m')).toBeTruthy()
  })

  it('selecting 2.7m chip sets ceilingHeight in store and advances', async () => {
    renderWizard()
    const chip = screen.getByText('2.7 m')
    fireEvent.click(chip)

    const state = useRoomStore.getState()
    expect(state.ceilingHeight).toBe(2700)

    // Should advance to step 1 (wall A)
    await waitFor(() => {
      expect(screen.getByText('A devor')).toBeTruthy()
    })
  })

  it('selecting 3.0m chip sets ceilingHeight to 3000', async () => {
    renderWizard()
    const chip = screen.getByText('3.0 m')
    fireEvent.click(chip)

    expect(useRoomStore.getState().ceilingHeight).toBe(3000)
  })
})

describe('WizardPage – Step 1 (Wall A)', () => {
  it('advancing to step 1 shows wall A inputs', async () => {
    renderWizard()
    // Click Keyingi button
    const nextBtn = screen.getByText('Keyingi')
    fireEvent.click(nextBtn)

    await waitFor(() => {
      expect(screen.getByText('A devor')).toBeTruthy()
    })
  })

  it('shows add element button on wall step', async () => {
    renderWizard()
    fireEvent.click(screen.getByText('Keyingi'))

    await waitFor(() => {
      expect(screen.getByText(/Eshik \/ Deraza qo'shish/)).toBeTruthy()
    })
  })

  it('adding an element shows chip', async () => {
    renderWizard()
    // Advance to wall A step
    fireEvent.click(screen.getByText('Keyingi'))

    await waitFor(() => screen.getByText(/Eshik \/ Deraza qo'shish/))

    // Open bottom sheet
    fireEvent.click(screen.getByText(/Eshik \/ Deraza qo'shish/))

    // Wait for sheet and click Qo'shish
    await waitFor(() => screen.getByText("Qo'shish"))
    fireEvent.click(screen.getByText("Qo'shish"))

    // Chip should appear
    await waitFor(() => {
      expect(screen.getByText(/Eshik/)).toBeTruthy()
    })

    // Verify store updated
    const { geometry } = useRoomStore.getState()
    const wallA = geometry.walls.find((w) => w.id === 'A')
    expect(wallA?.elements.length).toBe(1)
    expect(wallA?.elements[0].type).toBe('eshik')
  })

  it('removing chip removes element from store', async () => {
    renderWizard()
    fireEvent.click(screen.getByText('Keyingi'))

    await waitFor(() => screen.getByText(/Eshik \/ Deraza qo'shish/))
    fireEvent.click(screen.getByText(/Eshik \/ Deraza qo'shish/))
    await waitFor(() => screen.getByText("Qo'shish"))
    fireEvent.click(screen.getByText("Qo'shish"))

    await waitFor(() => screen.getByLabelText("O'chirish"))

    // Remove element
    fireEvent.click(screen.getByLabelText("O'chirish"))

    await waitFor(() => {
      const { geometry } = useRoomStore.getState()
      const wallA = geometry.walls.find((w) => w.id === 'A')
      expect(wallA?.elements.length).toBe(0)
    })
  })
})

describe('WizardPage – Step 5 (Results)', () => {
  it('step 5 shows metric cards', async () => {
    renderWizard()

    // Navigate through all 5 "Keyingi" clicks (step 0 → 5)
    for (let i = 0; i < 5; i++) {
      await waitFor(() => screen.getByText('Keyingi'))
      fireEvent.click(screen.getByText('Keyingi'))
    }

    await waitFor(() => {
      expect(screen.getByText("O'lchamlar saqlandi!")).toBeTruthy()
    })

    expect(screen.getByText('Pol maydoni')).toBeTruthy()
    expect(screen.getByText('Devor maydoni (netto)')).toBeTruthy()
    expect(screen.getByText('Perimetr')).toBeTruthy()
    expect(screen.getByText('Eshik/derazalar')).toBeTruthy()
  })

  it('calls createApartment and createRoom on step 5', async () => {
    const { createApartment, createRoom } = await import('@/lib/api')
    renderWizard()

    for (let i = 0; i < 5; i++) {
      await waitFor(() => screen.getByText('Keyingi'))
      fireEvent.click(screen.getByText('Keyingi'))
    }

    await waitFor(() => {
      expect(createApartment).toHaveBeenCalled()
      expect(createRoom).toHaveBeenCalled()
    })
  })
})
