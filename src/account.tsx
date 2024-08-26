import {
  Action,
  ActionPanel,
  Color,
  Detail,
  Form,
  Icon,
  List,
  LocalStorage,
  confirmAlert,
  open,
  useNavigation,
} from '@raycast/api'
import { usePromise } from '@raycast/utils'
import { randomUUID } from 'crypto'
import storage, { Storage } from './util/storage'
import fs from 'fs'
import { ReactElement, useState } from 'react'
import * as cheerio from 'cheerio'

export default function Command() {
  const { push } = useNavigation()
  const [error, setError] = useState(undefined as string | undefined)
  const [showSecret, setShowSecret] = useState(false)

  const { data: store, isLoading } = usePromise(storage)

  if (isLoading) {
    return <List isLoading />
  }

  if (store?.account) {
    const Actions = (props: { children?: ReactElement; content: string | number }) => (
      <ActionPanel>
        {props.children}
        <Action.CopyToClipboard content={props.content} />
      </ActionPanel>
    )
    const ShowSecretAction = (
      <Action
        title={showSecret ? 'Hide Secret' : 'Show Secret'}
        onAction={() => {
          setShowSecret(!showSecret)
        }}
      />
    )
    return (
      <List>
        <List.Item
          title="Status"
          icon={{ source: Icon.CheckCircle, tintColor: Color.Blue }}
          subtitle="Working"
          actions={
            <ActionPanel>
              <Action
                title="Logout"
                onAction={async () => {
                  if (
                    await confirmAlert({
                      title: 'Are you sure you want to log out?',
                    })
                  ) {
                    await LocalStorage.removeItem('account')
                    await LocalStorage.removeItem('instanceUrl')
                    push(<Command />)
                  }
                }}
              />
            </ActionPanel>
          }
        />
        <List.Section title="Account">
          <List.Item
            title="Username"
            subtitle={store.account.username}
            actions={<Actions content={store.account.username} />}
          />
          <List.Item
            title="Full Name"
            subtitle={showSecret ? store.account.fullName : '••••••••••'}
            actions={<Actions content={store.account.fullName}>{ShowSecretAction}</Actions>}
          />
          <List.Item title="Email" subtitle={store.account.email} actions={<Actions content={store.account.email} />} />
          <List.Item
            title="Role"
            subtitle={store.account.role[0].toUpperCase() + store.account.role.slice(1)}
            actions={<Actions content={store.account.role[0].toUpperCase() + store.account.role.slice(1)} />}
          />
        </List.Section>
        <List.Section title="Debug">
          <List.Item title="Device ID" subtitle={store.deviceId} actions={<Actions content={store.deviceId} />} />
          <List.Item
            title="Secret"
            subtitle={showSecret ? store.account.secret : '••••••••••'}
            actions={<Actions content={store.account.secret}>{ShowSecretAction}</Actions>}
          />
          <List.Item
            title="Secret Creation Date"
            subtitle={new Date(store.account.tokenDate).toLocaleString()}
            actions={<Actions content={store.account.tokenDate} />}
          />
        </List.Section>
      </List>
    )
  } else {
    if (!store?.instanceUrl) {
      return (
        <Form
          actions={
            <ActionPanel>
              <Action.SubmitForm
                title="Submit"
                onSubmit={async (values: { instanceUrl: string }) => {
                  validateUrl(values.instanceUrl, setError)
                  if (error) return
                  const instanceUrl = values.instanceUrl.trim().replace(/\/$/, '')
                  await LocalStorage.setItem('instanceUrl', instanceUrl)
                  push(<OpenBrowser />)
                }}
              />
            </ActionPanel>
          }
        >
          <Form.Description text="Welcome to the Firefly Raycast extension! To get started, you will need to enter the URL to your Firefly instance." />
          <Form.Description text="It should look something like https://example.fireflycloud.net, but it might be different depending on your school and the region you are in."></Form.Description>
          <Form.TextField
            id="instanceUrl"
            autoFocus
            error={error}
            onChange={(e) => {
              validateUrl(e, setError)
            }}
            title="URL to your Firefly Instance"
            info={`This is the URL to your Firefly instance. It should look something like https://example.fireflycloud.net, but it might be different depending on your school and the region you are in.`}
            placeholder="https://example.fireflycloud.net"
          />
        </Form>
      )
    } else return <OpenBrowser />
  }
}

function OpenBrowser() {
  const { data: store } = usePromise(storage)
  let deviceId = store?.deviceId

  if (!store?.deviceId) {
    const newId = randomUUID().toUpperCase()
    LocalStorage.setItem('deviceId', newId)
    deviceId = newId
  }

  return (
    <Detail
      isLoading={!store}
      actions={
        <ActionPanel>
          <Action.Push
            target={<PasteToken />}
            title="Open Browser"
            onPush={() => {
              open(
                `${store!.instanceUrl}/login/login.aspx?prelogin=${encodeURIComponent(
                  `/Login/api/gettoken?ffauth_device_id=${deviceId}&ffauth_secret=&device_id=${deviceId}&app_id=ipad_tasks`,
                )}`,
              )
            }}
          />
        </ActionPanel>
      }
      markdown={`# Login
To log into your account, you will first need to log into your Firefly account in your browser. Use the Open Browser action and log in.

When you have logged in and are greeted with some code, head back here.`}
    />
  )
}

function PasteToken() {
  const { push } = useNavigation()

  return (
    <Form
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title="Submit File"
            onSubmit={(values: { files: string[] }) => {
              const file = values.files[0]
              if (!fs.existsSync(file) || !fs.lstatSync(file).isFile()) {
                return false
              }
              const token = fs.readFileSync(file).toString('utf-8')
              const xml = parseXML(token)
              if (!validateXML(xml)) {
                return false
              }
              LocalStorage.setItem('account', JSON.stringify(xml))
              push(<Command />)
            }}
          />
        </ActionPanel>
      }
    >
      <Form.Description text="Now that you have logged in, you should see some code with <token> wrapped around it." />
      <Form.Description text="Please save the webpage to your Mac using the right click menu in your browser as a .xml file. Once that is done, you can select it below."></Form.Description>
      <Form.FilePicker id="files" allowMultipleSelection={false} />
    </Form>
  )
}

function validateUrl(url: string | undefined, setError: (error: string | undefined) => void) {
  if (!url) {
    setError('Please enter a URL')
    return
  }
  try {
    new URL(url)
  } catch (e) {
    setError('Please enter a valid URL')
    return
  }
  setError(undefined)
}

function parseXML(xml: string) {
  const $ = cheerio.load(xml)
  const secret = $('secret').text()
  const username = $('user').attr('username')
  const fullName = $('user').attr('fullname')
  const email = $('user').attr('email')
  const guid = $('user').attr('guid')
  const role = $('user').attr('role')
  const tokenDate = $('datetime').attr('rfc1123') ? new Date($('datetime').attr('rfc1123')!).getTime() : null
  return {
    secret,
    username,
    fullName,
    email,
    guid,
    role,
    tokenDate,
  } as Storage['account']
}

function validateXML(xml: Storage['account']) {
  if (!xml) return false
  if (!xml.secret) return false
  if (!xml.username) return false
  if (!xml.fullName) return false
  if (!xml.email) return false
  if (!xml.guid) return false
  if (!xml.role) return false
  if (!xml.tokenDate) return false
  return true
}
