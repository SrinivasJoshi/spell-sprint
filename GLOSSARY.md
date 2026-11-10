# SpellSprint

A browser-based spelling race: people gather in a Room, each Round shows a picture, and Players race to spell what it shows.

## Play

**Room**:
A place people gather in, reached through a shareable 6-character code. A Room may host zero, one or several Matches; nothing ties a Room to a fixed number of them.
_Avoid_: Lobby (as a noun for the Room), game, session

**Solo Room**:
A Room that only its creator can be in; nobody else can join it. Solo play is a Solo Room, not a separate mode.
_Avoid_: Solo Blitz, solo mode

**Public Room**:
A Room listed on the main site for anyone to join.

**Private Room**:
A Room reachable only by someone who has its link or code.

**Match**:
One run of exactly 5 Rounds, ending at the Podium.
_Avoid_: Game

**Round**:
One picture and one target word, with its own timer.

**Podium**:
The end-of-Match display: final placings and each Player's points.
_Avoid_: Summary, results screen

## People

**Player**:
Someone competing in the current Match.

**Spectator**:
Someone in a Room who is not competing in the current Match, such as a person who arrived mid-Match.

**Seat**:
A Player's place in a Match, holding their points; it survives a short disconnection.

**Host**:
The Player who may start a Match. The role passes to someone else when the Host leaves; it carries no power over other people.

**Guest**:
An anonymous identity with a generated handle, existing only in the browser and the Rooms it visits. A Guest has no persisted history.
_Avoid_: Anonymous user, unclaimed user

**Account**:
A registered identity with a claimed username, a profile and persisted history. Becoming one is how a Guest "claims a name".
_Avoid_: Claimed user, profile (as a synonym)

## Guessing

**Blanks**:
The slots shown for the target word, one per character. A slot is either typed by the Player or given (a Hint Letter, or a separator such as a space or hyphen).

**Hint Letter**:
A letter of a hard word revealed to every Player at the start of the Round. It costs no points.

**Near Miss**:
A wrong guess that differs from the target word by exactly one letter or by one swap of adjacent letters.

## Catalogue

**Word**:
One entry of the Catalogue: a target spelling, its picture and its difficulty.
_Avoid_: Item, asset, object

**Catalogue**:
The curated set of Words that Rounds draw from.
_Avoid_: Word list, dictionary
