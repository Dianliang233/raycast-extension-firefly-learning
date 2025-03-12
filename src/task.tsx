import {
  Action,
  ActionPanel,
  Color,
  Detail,
  Form,
  Icon,
  Keyboard,
  List,
  open,
  showToast,
  Toast,
  useNavigation,
} from '@raycast/api'
import { usePromise, useCachedPromise, useCachedState, getAvatarIcon, showFailureToast, useForm } from '@raycast/utils'
import got from 'got'
import storage, { Storage } from './util/storage.js'
import dateFormat from './util/dateFormat.js'
import * as cheerio from 'cheerio'
import { NodeHtmlMarkdown } from 'node-html-markdown'
import { useEffect } from 'react'

export default function CommandWrapper() {
  const { data: store } = usePromise(storage)
  if (!store) return <List isLoading />
  return <Command store={store} />
}

let rootRevalidate: () => void

function Command({ store }: Readonly<{ store: Storage }>) {
  const [filter, setFilter] = useCachedState('filter', 'AllIncludingArchived')
  const { data, pagination, isLoading, revalidate } = useCachedPromise(
    (filter: string) =>
      async ({ page }: { page: number }) => {
        const all = [] as Item[]
        const res = JSON.parse(
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
                  page,
                  pageSize: 50,
                  sortingCriteria: [{ column: 'DueDate', order: 'Descending' }],
                }),
              },
            )
          ).body,
        )
        if (res?.items) all.push(...res.items)

        const data = all.sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())
        return { data, hasMore: res?.aggregateOffsets.toFfIndex !== res?.totalCount, pageSize: res?.totalCount }
      },
    [filter],
  )
  rootRevalidate = revalidate

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
      pagination={pagination}
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

      {toDo.length === 0 && done.length === 0 && (
        <List.EmptyView icon={{ source: 'https://placecats.com/500/500' }} title="No tasks found" />
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
        ...(item.isDone
          ? []
          : [
              {
                tag: {
                  value: dateFormat(new Date(item.dueDate), false, true, 'short'),
                  color:
                    Math.floor((new Date(item.dueDate).getTime() - Date.now()) / 1000 / 60 / 60 / 24) + 1 < 0
                      ? Color.Red
                      : undefined,
                },
              },
            ]),
        ...(item.isDone
          ? []
          : item.isUnread && isReallyUnread
            ? [{ tag: { color: Color.Green, value: 'Unread' } }]
            : []),
      ]}
      icon={
        item.archived
          ? { source: Icon.Tray, tintColor: Color.SecondaryText }
          : item.isDone
            ? {
                source: Icon.CheckCircle,
                tintColor: Color.Green,
              }
            : item.isExcused
              ? { source: Icon.CheckCircle, tintColor: Color.Magenta }
              : item.isResubmissionRequired
                ? { source: Icon.Repeat, tintColor: Color.Red }
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
      ) : Math.floor((new Date(item.dueDate).getTime() - Date.now()) / 1000 / 60 / 60 / 24) + 1 < 0 ? (
        <Detail.Metadata.Label
          title="Status"
          text="Overdue"
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

      <Detail.Metadata.Separator />

      <Detail.Metadata.Label title="Set on" text={dateFormat(new Date(item.setDate))} />
      <Detail.Metadata.Label title="Due on" text={dateFormat(new Date(item.dueDate))} />

      <Detail.Metadata.Separator />

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
            .join(', ') || 'No Requirement'
        }
      />

      <Detail.Metadata.Separator />

      <Detail.Metadata.Label title="ID" text={item.id.toString()} />
    </>
  )
}

function ViewTaskDetail({ item, store }: Readonly<{ item: Item; store: Storage }>) {
  useEffect(() => {
    got
      .post(
        `${store?.instanceUrl}/_api/1.0/tasks/${item.id}/mark_as_read?ffauth_device_id=${store?.deviceId}&ffauth_secret=${store?.account.secret}`,
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            data: JSON.stringify({ recipient: { type: 'user', guid: store?.account.guid } }),
          }).toString(),
        },
      )
      .then(() => {})
  }, [item])
  const { data, isLoading, revalidate } = useCachedPromise(
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
      return state as TaskDetail
    },
    [item],
  )

  const task = (!isLoading ? NodeHtmlMarkdown.translate(data?.task.task.description as string, {}) : '').replace(
    /\[(.*?)\]\((.+?)\)/g,
    (match, text, url) => {
      if (url.startsWith('http')) return match
      if (url.startsWith('resource.aspx?id='))
        return `[${text}](${store.instanceUrl}/${url}&ffauth_device_id=${store.deviceId}&ffauth_secret=${store.account.secret})`
      if (url.startsWith('/')) return `[${text}](${store.instanceUrl}${url})`
      return `[${text}](${store.instanceUrl}/${url})`
    },
  )

  function markAs(status: 'done' | 'undone', item: Item) {
    return async () => {
      await showToast({ title: 'Updating task' })
      try {
        await got.post(
          `${store.instanceUrl}/_api/1.0/tasks/${item.id}/responses?ffauth_device_id=${store.deviceId}&ffauth_secret=${store.account.secret}`,
          {
            form: {
              data: JSON.stringify({
                recipient: { type: 'user', guid: (await storage()).account.guid },
                event: {
                  type: `mark-as-${status}`,
                  feedback: '',
                  sent: new Date().toISOString(),
                  author: (await storage()).account.guid,
                },
              }),
            },
          },
        )
      } catch (error) {
        if (item.fileSubmissionRequired) {
          await showFailureToast(error, {
            title: 'Operation failed',
            message: 'This task requires a file submission.',
            primaryAction: {
              title: 'Open in browser',
              onAction: () => open(`${store.instanceUrl}/set-tasks/${item.id}`),
            },
          })
        }
      }
      revalidate()
      rootRevalidate()
    }
  }

  return (
    <Detail
      isLoading={isLoading}
      markdown={task}
      actions={
        <ActionPanel>
          <Action.OpenInBrowser url={`${store.instanceUrl}/set-tasks/${item.id}`} />
          {item.isDone ? (
            <Action title="Mark as to Do" icon={Icon.XMarkCircle} onAction={markAs('undone', item)} />
          ) : (
            <Action title="Mark as Done" icon={Icon.CheckCircle} onAction={markAs('done', item)} />
          )}
          <Action.Push title="Send a Comment" icon={Icon.Message} target={<CommentTask item={item} store={store} />} />
          <Action.CopyToClipboard
            title="Copy URL"
            content={`${store.instanceUrl}/set-tasks/${item.id}`}
            shortcut={Keyboard.Shortcut.Common.Copy}
          />
        </ActionPanel>
      }
      metadata={
        <Detail.Metadata>
          {data?.task?.task?.attachments && data?.task?.task?.attachments.length > 0 && (
            <>
              <Detail.Metadata.TagList title="Attachments">
                {data?.task?.task?.attachments.map((attachment) => (
                  <Detail.Metadata.TagList.Item
                    key={attachment.id}
                    text={attachment.fileName}
                    icon={Icon.Paperclip}
                    onAction={() => open(`${store.instanceUrl}/_api/1.0/tasks/${item.id}/attachments/${attachment.id}`)}
                  />
                ))}
              </Detail.Metadata.TagList>
              <Detail.Metadata.Separator />
            </>
          )}

          <TaskDetailMetadata item={item} Detail={Detail} />
        </Detail.Metadata>
      }
    />
  )
}

function CommentTask({ item, store }: Readonly<{ item: Item; store: Storage }>) {
  const { pop } = useNavigation()
  const { handleSubmit, itemProps } = useForm<{ message: string }>({
    async onSubmit(values) {
      showToast({
        style: Toast.Style.Success,
        title: 'Message sent',
      })

      await got.post(
        `${store.instanceUrl}/_api/1.0/tasks/${item.id}/responses?ffauth_device_id=${store.deviceId}&ffauth_secret=${store.account.secret}`,
        {
          form: {
            data: JSON.stringify({
              recipient: { type: 'user', guid: (await storage()).account.guid },
              event: {
                type: 'comment',
                feedback: '',
                message: values.message,
                sent: new Date().toISOString(),
                author: (await storage()).account.guid,
              },
            }),
          },
        },
      )
      pop()
    },
  })

  return (
    <Form
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Submit" onSubmit={handleSubmit} />
        </ActionPanel>
      }
    >
      <Form.Description title="Task" text={item.title} />
      <Form.Description title="Recipient" text={item.setter.name} />

      <Form.Separator />

      <Form.TextArea title="Message" {...itemProps.message} />
    </Form>
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

interface TaskDetail {
  task: {
    task: {
      id: number
      title: string
      displayTitle: string
      setDateUtc: [string]
      dueDateUtc: [string]
      description: string
      descriptionContainsQuestions: boolean
      descriptionPageUrl: string
      descriptionPageId: [30683]
      attachments: {
        id: number
        type: string
        fileName: string
      }[]
      pageId: string
      archived: boolean
      setterGuid: string
      taskType: string
      fileSubmissionRequired: boolean
      addressees: {
        displayName: string
        pictureHref: string
        type: string
        guid: string
      }[]
      releaseMode: string
    }
    setter: {
      name: string
      sortKey: string
    }
  }
  loggedInUser: {
    guid: string
    role: string
    name: string
    isAdmin: boolean
  }
  renderRestrictedView: boolean
  responses: {
    responses: {
      recipient: {
        type: string
        guid: string
      }
      latestVersionId: number
      events: [
        {
          description: {
            type: string
            taskTitle: string
            eventVersionId: number
            author: string
            eventGuid: null
            sent: string
          }
          state: {
            released: boolean
            releasedAt: string
            canDelete: boolean
            canEdit: boolean
            edited: boolean
            deleted: boolean
            read: boolean
          }
        },
      ]
    }[]

    users: Record<
      string,
      {
        name: string
        sortKey: string
      }
    >
  }
}
