import { Action, ActionPanel, Icon, Keyboard, List, LocalStorage } from '@raycast/api'
import { usePromise, useCachedPromise } from '@raycast/utils'
import got from 'got'
import storage, { Storage } from './util/storage'
import * as cheerio from 'cheerio'
import { useState } from 'react'

interface Item {
  url: string
  section: string | null
  title: string
  id: number
  hasChildren: boolean
}

export default function Command(propsRaw?: { url: string; section: string | null; title: string; pinned?: Item[] }) {
  const props = {
    url: '/dashboard',
    section: null,
    title: 'Dashboard',
    pinned: [],
    ...propsRaw,
  }
  const { data: store1, isLoading: isLoading1 } = usePromise(storage)
  const store = store1!
  const [pinned, setPinned] = useState<Item[] | undefined>(props.pinned)
  if (store?.resource && pinned === undefined) {
    const resource = store.resource || {}
    setPinned(resource.pinned)
  }
  const { data, isLoading: isLoading2 } = useCachedPromise(
    async (url: string, section: string | null, store: Storage): Promise<Item[]> => {
      const $ = cheerio.load(
        (
          await got.get(
            `${store?.instanceUrl}${url}?view=xml&ffauth_device_id=${store?.deviceId}&ffauth_secret=${store?.account.secret}`,
          )
        ).body,
        { xmlMode: true },
      )

      let items
      if (section !== null) {
        items = $(`toplevel[title="${section}"]`).find('child')

        return items
          .map((i, e) => ({
            url: e.attribs.href,
            section: null,
            title: e.attribs.title,
            id: parseInt(e.attribs.page_id),
            hasChildren: true, // no way to tell
          }))
          .toArray()
      } else if (url === '/dashboard') {
        items = $('toplevel:not([href="/"])')

        return items
          .map((i, e) => ({
            url: '/dashboard',
            section: e.attribs.title,
            title: e.attribs.title,
            id: parseInt(e.attribs.id),
            hasChildren: true,
          }))
          .toArray()
      } else {
        const selected = $('pagemenu > menu > item[selected="yes"]')
        if (selected.attr('homepage') === 'yes') {
          items = $('pagemenu > menu > item').filter((i, e) => e.attribs.homepage !== 'yes')
        } else {
          items = $('pagemenu item[selected="yes"] item')
        }

        return items
          .map((i, e) => ({
            url: e.attribs.href,
            section: null,
            title: e.attribs.title,
            id: parseInt(e.attribs.id),
            hasChildren: e.attribs.numchildren !== '0',
          }))
          .toArray()
      }
    },
    [props.url, props.section, store],
    {
      execute: Boolean(store).valueOf(),
    },
  )

  return (
    <List
      isLoading={isLoading1 || isLoading2}
      actions={
        store ? (
          <ActionPanel>
            <Action.OpenInBrowser url={`${store.instanceUrl}/${props.url}`} />
          </ActionPanel>
        ) : undefined
      }
    >
      {data && (
        <>
          {props.url === '/dashboard' && props.section === null && pinned?.length !== 0 && (
            <List.Section title="Pinned">
              {pinned?.map((item) => <ResourceItem key={item.id} {...{ item, store, pinned, setPinned }} />)}
            </List.Section>
          )}
          <List.Section title={props.title}>
            {data.map((item) => (
              <ResourceItem key={item.id} {...{ item, store, pinned: pinned!, setPinned }} />
            ))}
          </List.Section>
        </>
      )}
    </List>
  )
}

function ResourceItem({
  item,
  store,
  pinned,
  setPinned,
}: Readonly<{ item: Item; store: Storage; pinned: Item[]; setPinned: (pinned: Item[]) => void }>) {
  return (
    <List.Item
      key={item.id}
      title={item.title}
      icon={item.hasChildren ? { source: Icon.Folder } : { source: Icon.Document }}
      accessories={
        pinned.some((i) => i.id === item.id)
          ? [
              {
                text: 'Pinned',
                icon: Icon.Star,
              },
            ]
          : undefined
      }
      actions={
        <ActionPanel>
          {item.hasChildren && (
            <Action.Push
              title="View Content"
              target={<Command title={item.title} url={item.url} section={item.section} pinned={pinned} />}
            />
          )}
          <Action.OpenInBrowser url={`${store.instanceUrl}/${item.url}`} />
          {/* {props.url !== '/dashboard' && (
                    <Action title="Bookmark Page" icon={Icon.Bookmark} onAction={() => bookmarkPage(item.id, store)} />
                  )} */}
          {pinned.some((i) => i.id === item.id) ? (
            <Action
              title="Unpin Page"
              icon={Icon.StarDisabled}
              shortcut={Keyboard.Shortcut.Common.Pin}
              onAction={() => {
                unpinPage(item, store, setPinned)
              }}
            />
          ) : (
            <Action
              title="Pin Page"
              icon={Icon.Star}
              shortcut={Keyboard.Shortcut.Common.Pin}
              onAction={() => {
                pinPage(item, store, setPinned)
              }}
            />
          )}
        </ActionPanel>
      }
    />
  )
}

// async function bookmarkPage(id: number, store: Storage) {
//   await got.post(
//     `${store.instanceUrl}/dashboard-subscribe.aspx?page_id=${id}&on=yes&subscriptionType=bookmark&ffauth_device_id=${store.deviceId}&ffauth_secret=${store.account.secret}`,
//   )
// }
// not working due to auth issues

async function pinPage(item: Item, store: Storage, setPinned: (pinned: Item[]) => void) {
  const resource = store.resource || {}
  setPinned([...(resource.pinned || []), item])
  await LocalStorage.setItem('resource', JSON.stringify({ ...resource, pinned: [...(resource.pinned || []), item] }))
}

async function unpinPage(item: Item, store: Storage, setPinned: (pinned: Item[]) => void) {
  const resource = store.resource || {}
  setPinned((resource.pinned || []).filter((i) => i.id !== item.id))
  await LocalStorage.setItem(
    'resource',
    JSON.stringify({ ...resource, pinned: (resource.pinned || []).filter((i) => i.id !== item.id) }),
  )
}
