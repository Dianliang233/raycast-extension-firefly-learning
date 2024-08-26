import { Action, ActionPanel, List } from '@raycast/api'
import { usePromise, useCachedPromise, getAvatarIcon } from '@raycast/utils'
import got from 'got'
import storage, { Storage } from './util/storage'

interface Item {
  simple_url: string
  position: number
  from: {
    guid: string
    name: string
  }
  type: 'Personal' | 'Recommended'
  title: string
  is_form: boolean
  form_answered: boolean
  breadcrumb: string
  guid: string
  created: string
}

export default function CommandWrapper() {
  const { data: store } = usePromise(storage)
  if (!store) return <List isLoading />
  return <Command store={store} />
}

function Command(props: { store: Storage }) {
  const { store } = props
  const { data, isLoading } = useCachedPromise(async (): Promise<Item[]> => {
    const data: Item[] = JSON.parse(
      (
        await got.post(
          `${store?.instanceUrl}/_api/1.0/graphql?ffauth_device_id=${store?.deviceId}&ffauth_secret=${store?.account.secret}`,
          {
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
              data: /* GraphQL */ `
                  query Query {
                    users(guid: "${store.account.guid}") {
                      bookmarks {
                        simple_url
                        deletable
                        position
                        read
                        from {
                          guid
                          name
                        }
                        type
                        title
                        is_form
                        form_answered
                        breadcrumb
                        guid
                        created
                      }
                    }
                  }
                `,
            }).toString(),
          },
        )
      ).body,
    ).data.users[0].bookmarks

    return data.sort((a, b) => (a.position > b.position ? 1 : -1))
  })

  return (
    <List isLoading={isLoading}>
      {data &&
        data.map((item) => (
          <List.Item
            key={item.guid}
            id={item.guid}
            title={item.title}
            keywords={[item.from.name, item.breadcrumb]}
            accessories={[
              {
                text: item.from.name,
                icon: {
                  // source: `${store.instanceUrl}/api/v3/profilepicture?guid=${item.from.guid}ffauth_device_id=${store?.deviceId}&ffauth_secret=${store?.account.secret}`,
                  // fallback: getAvatarIcon(item.from.name), // reenable if fallback is working normally
                  source: getAvatarIcon(item.from.name),
                },
              },
            ]}
            actions={
              <ActionPanel>
                <Action.OpenInBrowser url={`${store.instanceUrl}/${item.simple_url}`} />
                <Action.CopyToClipboard content={`${store.instanceUrl}/${item.simple_url}`} />
              </ActionPanel>
            }
          />
        ))}
    </List>
  )
}
