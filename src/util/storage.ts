import { LocalStorage } from '@raycast/api'

export interface Storage {
  account: {
    secret: string
    username: string
    fullName: string
    email: string
    guid: string
    role: string
    tokenDate: number
  }
  instanceUrl: string
  deviceId: string
  resource: {
    pinned: {
      url: string
      section: string | null
      title: string
      id: number
      hasChildren: boolean
    }[]
  }
  taskPreferences: {
    bankruptcyAt: string | null
  }
}

async function allItems() {
  const raw = { ...(await LocalStorage.allItems()) }
  Object.keys(raw).forEach((key) => {
    try {
      raw[key] = JSON.parse(raw[key])
    } catch {
      // ignore
    }
  })

  return raw as Storage
}

export default allItems
