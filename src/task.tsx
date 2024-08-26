import { Action, ActionPanel, Color, Detail, Icon, List } from '@raycast/api'
import { usePromise, useCachedPromise, useCachedState, getAvatarIcon } from '@raycast/utils'
import got from 'got'
import storage, { Storage } from './util/storage'
import dateFormat from './util/dateFormat'
import * as cheerio from 'cheerio'
import { NodeHtmlMarkdown } from 'node-html-markdown'

export default function CommandWrapper() {
  const { data: store } = usePromise(storage)
  if (!store) return <List isLoading />
  return <Command store={store} />
}

function Command({ store }: Readonly<{ store: Storage }>) {
  const [filter, setFilter] = useCachedState('filter', 'AllIncludingArchived')
  const { data, isLoading } = useCachedPromise(
    async (filter: string) => {
      const all = [] as Item[]
      let page = 0
      let res

      do {
        res = JSON.parse(
          (
            await got.post(
              `${store?.instanceUrl}/api/v2/taskListing/view/student/tasks/all/filterBy?ffauth_device_id=${store?.deviceId}&ffauth_secret=${store?.account.secret}`,
              {
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  archiveStatus: 'All',
                  completionStatus: filter,
                  ownerType: 'OnlySetters',
                  page: page,
                  pageSize: 100,
                }),
              },
            )
          ).body,
        )

        all.push(...res.items)
        page++
      } while (res?.aggregateOffsets.toFfIndex !== res?.totalCount)

      return all.sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())
    },
    [filter],
  )

  const toDo = (data ?? [])
    .filter((item) => !(item.isDone || item.archived || item.isExcused))
    .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())
  const done = (data ?? [])
    .filter((item) => item.isDone || item.archived || item.isExcused)
    .sort((b, a) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())

  return (
    <List
      isShowingDetail
      isLoading={isLoading}
      searchBarAccessory={
        <List.Dropdown
          tooltip="Filter"
          value={filter}
          onChange={(newValue) => {
            setFilter(newValue)
          }}
        >
          <List.Dropdown.Section title="Progress">
            <List.Dropdown.Item title="All" value="AllIncludingArchived" />
            <List.Dropdown.Item title="To Do" value="Todo" />
            <List.Dropdown.Item title="Done" value="DoneOrArchived" />
          </List.Dropdown.Section>
        </List.Dropdown>
      }
    >
      {toDo.length !== 0 && (
        <List.Section title="To Do">
          {toDo.map((item) => (
            <TaskItem key={item.id} item={item} store={store} />
          ))}
        </List.Section>
      )}

      {done.length !== 0 && (
        <List.Section title="Done">
          {done.map((item) => (
            <TaskItem key={item.id} item={item} store={store} />
          ))}
        </List.Section>
      )}
    </List>
  )
}

function TaskItem({ item, store }: Readonly<{ item: Item; store: Storage }>) {
  const [isReallyUnread, setIsReallyUnread] = useCachedState(`task-${item.id}-isReallyRead`, true)

  return (
    <List.Item
      title={item.title}
      id={item.id.toString()}
      keywords={[item.id.toString(), item.title, item.setter.name, ...item.addressees.map((a) => a.name)]}
      accessories={[
        ...(item.isDone ? [] : [{ tag: dateFormat(new Date(item.dueDate), false, true, 'short') }]),
        ...(item.isDone
          ? []
          : item.isUnread && isReallyUnread
            ? [{ tag: { color: Color.Green, value: 'Unread' } }]
            : []),
      ]}
      icon={
        item.isDone
          ? {
              source: Icon.CheckCircle,
              tintColor: Color.Green,
            }
          : Math.floor((new Date(item.dueDate).getTime() - Date.now()) / 1000 / 60 / 60 / 24) + 1 < 0
            ? {
                source: Icon.XMarkCircle,
                tintColor: Color.Red,
              }
            : {
                source: Icon.Circle,
                tintColor: Color.SecondaryText,
              }
      }
      detail={
        <List.Item.Detail
          metadata={
            <List.Item.Detail.Metadata>
              <TaskDetailMetadata item={item} Detail={List.Item.Detail} />
            </List.Item.Detail.Metadata>
          }
        />
      }
      actions={
        <ActionPanel>
          <Action.Push title="View Detail" target={<ViewTaskDetail item={item} store={store} />} />
          <Action.OpenInBrowser
            url={`${store.instanceUrl}/set-tasks/${item.id}`}
            onOpen={() => setIsReallyUnread(false)}
          />
        </ActionPanel>
      }
    />
  )
}

function TaskDetailMetadata({ item, Detail }: Readonly<{ item: Item; Detail: typeof List.Item.Detail }>) {
  // console.log(`https://ulinkcn.fireflycloud.net.cn/api/v3/profilepicture?guid=${item.setter.guid}`)
  // console.log(item.mark)

  return (
    <>
      {item.isPersonalTask && (
        <Detail.Metadata.Label
          title="Personal Task"
          icon={{
            source: Icon.CheckCircle,
            tintColor: Color.Green,
          }}
        />
      )}
      {item.archived ? (
        <Detail.Metadata.Label
          title="Status"
          text="Archived"
          icon={{
            source: Icon.Tray,
            tintColor: Color.SecondaryText,
          }}
        />
      ) : item.isDone ? (
        <Detail.Metadata.Label
          title="Status"
          text="Done"
          icon={{
            source: Icon.CheckCircle,
            tintColor: Color.Green,
          }}
        />
      ) : item.isExcused ? (
        <Detail.Metadata.Label
          title="Status"
          text="Excused"
          icon={{
            source: Icon.CheckCircle,
            tintColor: Color.Green,
          }}
        />
      ) : item.isResubmissionRequired ? (
        <Detail.Metadata.Label
          title="Status"
          text="Resubmission required"
          icon={{
            source: Icon.Circle,
            tintColor: Color.Red,
          }}
        />
      ) : (
        <Detail.Metadata.Label
          title="Status"
          text="To Do"
          icon={{
            source: Icon.Circle,
            tintColor: Color.SecondaryText,
          }}
        />
      )}
      <Detail.Metadata.Label title="Title" text={item.title} />
      <Detail.Metadata.Label
        title="Set by"
        text={item.setter.name}
        icon={{
          // source: `${store.instanceUrl}/api/v3/profilepicture?guid=${item.setter   .guid}ffauth_device_id=${store?.deviceId}&ffauth_secret=${store?.account.secret}`,
          // fallback: getAvatarIcon(item.setter.name), // reenable if fallback is working normally
          source: getAvatarIcon(item.setter.name),
        }}
      />
      <Detail.Metadata.Label title="Set to" text={item.addressees.map((a) => a.name).join(', ')} />
      <Detail.Metadata.Label title="Set on" text={dateFormat(new Date(item.setDate))} />
      <Detail.Metadata.Label title="Due on" text={dateFormat(new Date(item.dueDate))} />
      <Detail.Metadata.Label
        title={item.mark.isMarked ? (item.mark.mark ? 'Mark' : item.mark.grade ? 'Grade' : 'Marked') : 'Marked'}
        icon={
          item.mark.isMarked
            ? item.mark.mark === null && item.mark.grade === null
              ? Icon.CheckCircle
              : undefined
            : Icon.XMarkCircle
        }
        text={
          item.mark.isMarked
            ? item.mark.mark
              ? `${item.mark.mark} / ${item.mark.markMax}${item.mark.grade ? ` (${item.mark.grade})` : ''}`
              : item.mark.grade
                ? item.mark.grade
                : 'Marked'
            : undefined
        }
      />
      <Detail.Metadata.Label
        title="Submission"
        text={
          [item.fileSubmissionRequired && 'File Required', item.descriptionContainsQuestions && 'Online Worksheet']
            .filter((i) => i)
            .join(', ') || 'None'
        }
      />
      <Detail.Metadata.Label title="ID" text={item.id.toString()} />
    </>
  )
}

function ViewTaskDetail({ item, store }: Readonly<{ item: Item; store: Storage }>) {
  const { data, isLoading } = useCachedPromise(
    async (item: Item) => {
      const $ = cheerio.load(
        (
          await got.get(
            `${store?.instanceUrl}/set-tasks/${item.id}?view=xml&ffauth_device_id=${store?.deviceId}&ffauth_secret=${store?.account.secret}`,
          )
        ).body,
        { xmlMode: true },
      )

      const state = JSON.parse($('task-details-react-component').attr('initial-state') ?? '{}')
      return state
    },
    [item],
  )

  console.log(
    `${store?.instanceUrl}/set-tasks/${item.id}?view=xml&ffauth_device_id=${store?.deviceId}&ffauth_secret=${store?.account.secret}`,
  )

  const task = (!isLoading ? NodeHtmlMarkdown.translate(data?.task?.task?.description, {}) : '').replace(
    /\[(.*?)\]\((.+?)\)/g,
    (match, text, url) => {
      if (url.startsWith('http')) return match
      if (url.startsWith('resource.aspx?id='))
        return `[${text}](${store.instanceUrl}/${url}&ffauth_device_id=${store.deviceId}&ffauth_secret=${store.account.secret})`
      if (url.startsWith('/')) return `[${text}](${store.instanceUrl}${url})`
      return `[${text}](${store.instanceUrl}/${url})`
    },
  )

  return (
    <Detail
      isLoading={isLoading}
      markdown={task}
      actions={
        <ActionPanel>
          <Action.OpenInBrowser url={`${store.instanceUrl}/set-tasks/${item.id}`} />
          <Action.CopyToClipboard title={`Copy URL`} content={`${store.instanceUrl}/set-tasks/${item.id}`} />
        </ActionPanel>
      }
      metadata={
        <Detail.Metadata>
          <TaskDetailMetadata item={item} Detail={Detail} />
        </Detail.Metadata>
      }
    />
  )
}

interface User {
  sortKey: string
  guid: string
  name: string
  deleted: boolean
}

interface Item {
  id: number
  title: string
  setter: User
  addressees: {
    guid: string
    name: string
    isGroup: boolean
    source: string
  }[]
  setDate: string
  dueDate: string
  student: User
  mark: {
    isMarked: boolean
    grade: string | null
    mark: number | null
    markMax: number | null
    hasFeedback: boolean
    feedback: string | null
  }
  isPersonalTask: boolean
  isExcused: boolean
  isDone: boolean
  isResubmissionRequired: boolean
  lastMarkedAsDoneBy: User | null
  archived: boolean
  isUnread: boolean
  fileSubmissionRequired: boolean
  hasFileSubmission: boolean
  descriptionContainsQuestions: boolean
  isMissingDueDate: boolean
  taskSource: string
  altLink: null
  classes: null
}