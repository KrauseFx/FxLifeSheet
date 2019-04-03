# FxLifeSheet

## Goal

To track all my relevant quantified data in a central place, in which I fully own the data

### Sub goals

As every person is so vastly different, has cares about different metrics in their life, this solution has to be highly customizable.

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

### User initiates data inputs

`lifesheet.json`

```json
{
  "sleeping": {
    "description": "Use this right when going to bed",
    "schedule": "daily",
    "categories": {
      "fitness": {
        "alcoholIntake": {
          "human": "Alcohol intake",
          "question": "How much alcohol did you drink today?",
          "replies": {
            "5": "Haha, hope you had a good time and the calories were all worth it. Make sure to still hit your protein goal and eat extra clean the next few days" 
          }
        },
        "macroAdherence": {
          "human": "Macro Adherence",
          "question": "How closely did you follow today's macro tracking?",
        },
        ...
      },
      "productivity": {
        "learnedNewSkills"
      }
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
- `monthly`

*Note*: `fourTimesADay` actually means 3 times a day, as the user will sleep while one of the questions is asked, depending on the time zone. 

### TODO: 
- [ ] How to phrase the points to be posivite and include expectations
- [ ] Use of Telegram `Force Reply` feature

#### Morning

`/awake`

This will trigger the morning questions, like:

- Sleep quality

#### Evening

`/sleeping`

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

### Recurring questions

For some values (like the mood) it makes sense for the bot to actively ask you to do things. 


### Reminders

There should be something built-in to remind the user to run the `/week` and the other commands if they didn't in a given time.

## Ideas

- For each question, add replies depending on the response, similar to what the [mood bot](https://github.com/krausefx/mood) is already doing, e.g.
  - Question "Do you feel like you're missing out on things?", user replies with "Yes, feeling sad", bot replies with "Okay, now think about 3 actions you can take to solve this, and implemnent at least one"


