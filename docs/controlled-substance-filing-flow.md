# The filing flow

The other half of `src/lib/cs-archive/archive-names.ts`. That file decides what
a filed page is called; this decides where it ends up. Change one without the
other and files stop moving — silently, which is the bad kind.

## What it does

Someone files a paper log in the Hub. Their browser reads the pages on their
own device, then uploads them **into an inbox library**, named so the
destination travels with the file:

```
<archiveKey>__<archiveLibrary>__<folderLabel>__<originalName>

a3f1c8d2__Clinic 2 Archive__2024-03 Murray Clinic 2 Ketamine administration log__page-1.jpg
```

A flow picks it up and moves it into its archive:

```
Clinic 2 Archive/2024-03 Murray Clinic 2 Ketamine administration log [a3f1c8d2]/page-1.jpg
```

The inbox exists because the people who file records must not be able to read
or alter the archive. They can add to an inbox and nothing else; only the flow's
account writes to an archive. The file passes through in about a minute.

## Why the destination is in the filename

The flow could have been told which archive belongs to which inbox. It isn't,
because a registration added later would then mean editing a flow, and the
whole point of mapping the location registrations ahead of time was that
nothing should need changing when their numbers arrive.

So the flow is identical for every inbox and contains no knowledge of any
registration. Adding one is: create two libraries, set permissions, copy this
flow, point its trigger at the new inbox.

## Before building it

**A service account.** The flow must not run as a person. When that person's
password changes or they leave, every flow they own stops, and files pile up in
an inbox where filers can read them. The account needs a licence that includes
SharePoint — at the time of writing there is a spare Microsoft 365 Business
Basic seat and a spare Office 365 E3 seat, so no purchase is needed.

**Group membership.** The service account goes in `CS Records - Filing Service`.
Nothing else should be in that group.

**One flow per inbox.** All five exist, owned by
`cs-filing@lonepeakpsychiatry.com` (Controlled Substance Filing Service), on the
Lone Peak Psychiatry default environment. The two whose registrations have not
been issued are built and turned off, so that when the numbers arrive nothing
has to be designed — only switched on.

| Flow | Trigger library | Registration | State |
|---|---|---|---|
| `CS filing - Clinic 1 Inbox` | `Clinic 1 Inbox` | MM5304819 — retired, amendments only | on |
| `CS filing - Clinic 2 Inbox` | `Clinic 2 Inbox` | MM8601898 | on |
| `CS filing - Lehi Inbox` | `Lehi Inbox` | Dr Bentley's | on |
| `CS filing - Murray Location DEA Inbox` | `Murray Location DEA Inbox` | not yet issued | off |
| `CS filing - Lehi Location DEA Inbox` | `Lehi Location DEA Inbox` | not yet issued | off |

Adding the sixth is Save As from any of them and changing one dropdown, because
nothing else in the flow knows which registration it serves.

## The flow

Automated cloud flow, owned by the service account.

### 1. Trigger — SharePoint, *When a file is created (properties only)*

- **Site Address**: `https://lonepeakpsychiatry.sharepoint.com/sites/ControlledSubstanceRecords`
- **Library Name**: the inbox this flow watches

### 2. *Initialize variable* — `parts`, type Array

```
split(triggerOutputs()?['body/{FilenameWithExtension}'], '__')
```

### 3. *Condition* — does this file carry a destination?

```
length(variables('parts'))
```
is **greater than or equal to** `4`.

**If no: do nothing.** Leave the file where it is. A file dropped into an inbox
by hand has no destination and must not be guessed at — burying somebody's
document in an unrelated registration's folder is worse than leaving it visible.
The Hub's integrity check is what notices it later.

### If yes

### 4. *Get file content* — SharePoint

- **File Identifier**: `triggerOutputs()?['body/{Identifier}']`

### 5. *Create new folder* — SharePoint

- **List or Library Name**: `variables('parts')[1]`
- **Folder Path**:

```
concat(variables('parts')[2], ' [', variables('parts')[0], ']')
```

This is expressed as a run-after on the NEXT action: *Create file* runs after
*Create new folder* **is successful OR has failed**. The folder already existing
is the normal case for the second and later pages of a log, and for every
amendment — an amendment reuses its parent's key precisely so it lands in the
same folder.

When you pick a library from the dropdown the designer stores its GUID, but
this step is given a library *title*, because the title is what travels in the
filename. That is fine: the connector resolves a title, confirmed by a real
filing returning 200 for `table: "Clinic 2 Archive"`.

### 6. *Create file* — SharePoint

- **Folder Path**:

```
concat(variables('parts')[1], '/', variables('parts')[2], ' [', variables('parts')[0], ']')
```

- **File Name**:

```
join(skip(variables('parts'), 3), '__')
```

`skip` and `join` rather than `parts[3]`, because the original filename may
itself contain the separator and must survive intact.

- **File Content**: the body from step 4.

### 7. *Delete file* — SharePoint

- **File Identifier**: `triggerOutputs()?['body/{Identifier}']`

Leave this on its default **run after: is successful**. If the copy failed, the
file must stay in the inbox. Deleting it would lose a controlled-substance
record because a network call timed out.

## What can go wrong, and what happens

**The flow is off, or its account is broken.** Files accumulate in the inbox,
readable by filers, and nothing reaches the archive. Nothing in SharePoint
complains. This is the failure the Hub's integrity check exists for: it knows
every record it filed, and can say which ones have no file behind them.

**A file with no destination in its name.** Left alone, visible, not moved.

**Two logs with the same folder label.** They are distinguished by the archive
key in the folder name, so they do not collide.

**An amendment.** Reuses its parent's key, so it lands in the same folder as
what it corrects, beside it rather than somewhere else. This is intended. Its
pages are prefixed `amendment-`, so they sit beside the originals instead of
replacing them. Choosing the log being corrected also fills in what that log
IS — period, substance, site, registration — because a correction is the same
log filed again, and an amendment saved without a period takes the original's
period off the record when it supersedes it.

## The link the Hub keeps

A filed record stores a link, and it is built from the DESTINATION, not from
the upload. The URL SharePoint returns when a page is uploaded identifies the
inbox copy by its unique id; this flow archives by copying and then deleting,
so the archived file is a different item with a different id and that link dies
the moment filing succeeds. The Hub would be left holding a record it could not
produce the pages for.

So the Hub builds `<archive library>/Forms/AllItems.aspx?id=<folder>` at filing
time — it already knows the library and the folder, because it chose them. It
points at the folder rather than a page, which is also what somebody wants: all
the pages, the entry index, and any later amendment.

That link and the folder the flow creates are the same string arrived at twice,
so they have to be derived the same way. They are, by `logFolderLabel` in
`archive-names.ts`, which takes the log rather than pre-formatted pieces —
after a version where the filing screen used the registration label and an
amendment used the location name, and an amendment therefore started a folder
of its own carrying its parent's key.

## Two things the designer will tell you that aren't true

**"This expression has a problem."** The expression editor flags every
`variables('parts')[n]` as a problem. It saves, validates and runs regardless —
the editor simply won't index into an array it can't see the contents of. Check
the action's **Code view** instead; that shows what will actually be submitted.

**"There's a potential problem with this flow."** On a freshly copied flow, open
the Flow checker and the only finding is *this flow is off*. Turning the flow on
clears it.

## Testing it

File one log with a single page against Clinic 2, from the Hub, and watch:

1. The file appears in `Clinic 2 Inbox` with a name containing `__`
2. Within a minute or so it disappears from the inbox
3. `Clinic 2 Archive` has a folder named `<label> [<key>]` containing the page
   under its original name
4. The Hub record's link opens it

If step 2 happens and step 3 doesn't, the file has been deleted without being
copied — stop and check step 7's run-after setting before filing anything else.

The trigger polls once a minute, so "within a minute or so" is the honest
figure; two is not a fault.

## The service account's sign-in

`cs-filing` is prompted to register for MFA when it signs in interactively.
This does not affect the flows — they run on the stored connection, not on an
interactive session — but it does mean the account cannot be signed into to
check anything without someone completing that registration. It is worth
deciding deliberately: a service account with a registered authenticator nobody
holds is worse than one with none. Whatever is chosen, the connection under
**Data > Connections** is what actually keeps the filing working, and it is the
thing to watch.
