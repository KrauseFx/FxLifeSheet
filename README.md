# FxLifeSheet

## Goal

To track all my relevant quantified data in a central place, in which I fully own the data

### Sub goals

As every person is so vastly different, and cares about different metrics in their life, this solution has to be highly customizable.

- Fully own the data in a usable format
- Easily add/remove data I track at any time
- Generate useful reports
- Keep myself accountable
- Focus on fitness, overall well-being, and self-improvements
- Easy input, that make it "fun" to track the data
- Clear separation between data input and analyzing data, as one has to work day to day while on-the-go, the other one requires a full desktop

## Implementation

**Assumptions**

- The user is in random time zones at random times and switches often, therefore the bot can't know about your daily schedule. This puts a lot of focus on averages, as it doesn't matter if a value was entered at 11pm that day, or 8am the next one, the numbers will even out, as only daily, weekly and monthly averages are considered when rendering graphs.

This repo contains a simple Telegram bot that has a limited amount of responsibilities.

There are 2 ways to input data: by the user telling the bot to ask for all the values, and by a regular interval of the bot asking you (similar to the [mood bot](https://github.com/krausefx/mood))

### Configuration

`lifesheet.json`

```json
{
  "sleeping": {
    "description": "Use this right when going to bed",
    "schedule": "daily",
    "values": {
      "alcoholIntake": {
        "human": "Alcohol intake",
        "question": "How much alcohol did you drink today?",
        "type": "range",
        "buttons": {
          "5": "Got wasted",
          "4": "Had 4-5 drinks",
          "3": "Had 3 drinks",
          "2": "Had 2 drinks",
          "1": "Had 1 drink",
          "0": "No alcohol"
        },
        "replies": {
          "5": "Haha, hope you had a good time and the calories were all worth it. Make sure to still hit your protein goal and eat extra clean the next few days" 
        }
      },
      "macroAdherence": {
        "human": "Macro Adherence",
        "question": "How closely did you follow today's macro tracking?",
        "type": "range"
      },
      "numberOfDailySteps": {
        "human": "Number of Daily Steps",
        "question": "How many steps did you take according to Apple Health?",
        "type": "number"
      }
      ...
    }
  },
  "week": {
    "description": "",
    "schedule": "weekly"
    ...
  },
}
```

Available values for `schedule`:

- `fourTimesADay`
- `daily`
- `weekly`
- `manual`

*Note*: `fourTimesADay` actually means 3 times a day, as the user will sleep while one of the questions is asked, depending on the time zone.

### User initiates data inputs 

### TODO: 
- [ ] How to phrase the points to be posivite and include expectations
- [ ] Use of Telegram `Force Reply` feature

#### Morning

`/awake`

This will trigger the morning questions, like:

- Sleep quality

#### Evening

`/asleep`

This will trigger the end-of-day questions like

- Fitness related:
  - Alcohol intake
  - Macro adherence
  - Hunger issues?
  - Fatigu/Lethargy?
  - Feel stressed?
- Productivity related
  - Solve technical challenges
  - Learned new skills
- Social
  - Felt like enough socializing?
  - Enough time by myself?
- Other
  - Medidated

#### Week

`/week`

This will trigger questions that take longer to reply, so they're only done weekly

- Fitness related
  - Body measurements
  - Current weight (as weight is measured in mfp anyway)
  - Current macros
  - Training adherence
  - Average daily steps
- Productivity
  - Overall happiness with progress of the week
  - Number of open Trello tasks (from [whereisfelix.today](https://whereisfelix.today))
  - Average daily hours on computer
  - Weekly total iOS screen time (minus MyFitnessPal and Strong app)
- Other
  - Locations (cities)
  - Got out of my comfort zone, experienced/tried new things
  - Do you feel like having to travel somewhere? 
  - Do you feel like you're missing out on things?

### Reminders

There should be something built-in to remind the user to run the `/week` and the other commands if they didn't in a given time.

e.g. if a `/sleeping` task is defined to be `/daily`, it would remind the user 25h after the previous entry. The user may then choose to ignore it or run the command whenever the want. The key is that the user always has to manually trigger the inputs, as we never want to ask them at a wrong time, or have an overlap of multiple "surveys"

## Ideas

- For each question, add replies depending on the response, similar to what the [mood bot](https://github.com/krausefx/mood) is already doing, e.g.
  - Question "Do you feel like you're missing out on things?", user replies with "Yes, feeling sad", bot replies with "Okay, now think about 3 actions you can take to solve this, and implemnent at least one"


## Development

### Running locally

```
npm run dev
```

### Debugging

After using `npm run dev`, open [chrome://inspect](chrome://inspect) to use the Chrome Dev Tools
