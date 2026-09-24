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

**One flow per inbox.** Five eventually; three that are in use now:

| Trigger library | Registration |
|---|---|
| `Clinic 1 Inbox` | MM5304819 — retired, amendments only |
| `Clinic 2 Inbox` | MM8601898 |
| `Lehi Inbox` | Dr Bentley's |
| `Murray Location DEA Inbox` | not yet issued |
| `Lehi Location DEA Inbox` | not yet issued |

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

Set this action's **Configure run after** to continue on failure as well as
success. The folder already existing is the normal case for the second and
later pages of a log, and for every amendment — an amendment reuses its
parent's key precisely so it lands in the same folder.

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
what it corrects, beside it rather than somewhere else. This is intended.

## Testing it

File one log with a single page against Clinic 2, from the Hub, and watch:

1. The file appears in `Clinic 2 Inbox` with a name containing `__`
2. Within a minute or so it disappears from the inbox
3. `Clinic 2 Archive` has a folder named `<label> [<key>]` containing the page
   under its original name
4. The Hub record's link opens it

If step 2 happens and step 3 doesn't, the file has been deleted without being
copied — stop and check step 7's run-after setting before filing anything else.
