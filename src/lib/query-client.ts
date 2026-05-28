type Listener = () => void

class QueryClient {
  private listeners: Record<string, Set<Listener>> = {}
  private timeouts: Record<string, ReturnType<typeof setTimeout>> = {}

  invalidateQueries(options: { queryKey: string[] }) {
    const key = options.queryKey.join('-')

    // Debounce to prevent flickering and excessive network requests
    if (this.timeouts[key]) {
      clearTimeout(this.timeouts[key])
    }

    this.timeouts[key] = setTimeout(() => {
      if (this.listeners[key]) {
        this.listeners[key].forEach((listener) => listener())
      }
    }, 300) // 300ms debounce
  }

  subscribe(queryKey: string[], listener: Listener) {
    const key = queryKey.join('-')
    if (!this.listeners[key]) {
      this.listeners[key] = new Set()
    }
    this.listeners[key].add(listener)
    return () => {
      this.listeners[key].delete(listener)
    }
  }
}

export const queryClient = new QueryClient()
