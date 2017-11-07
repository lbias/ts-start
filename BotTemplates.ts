import {ErrorRequestHandler, RequestHandler} from 'express'
import {bind, contains, curry, not, pick} from 'ramda'
import {Blueprint, FAQData, State} from './data/db'
import * as Preprocess from './libs/preprocess'
import {FactoryType, ButtonType, Chart, ContentNode, EventNode, FacebookType, ModuleConfig, ModuleType, StateType, TaskNode, TriggerNode} from './libs/types'
import {_, Buttons, responseToString, Elements, interact, moment, log, mapToObject, objectToMap, QuickReplies, sample, string2template} from './libs/util'
import {sticker2emotion} from './modules/emotion'
import {Alexandria} from './modules/faq'
import {Line} from './modules/line'
import {Webchat} from './modules/wechat'
import {Workplace} from './modules/workplace'
import * as scheduler from 'node-schedule'

import Analytics from './libs/analytics'
import Modules from ',/modules'

// Loding cutome modules
// Live
import GOVSG from '.custom_modules/govsg'
import GOLDHEART from './custom_modules/goldheart'
import MSIG from './custom_modules/msig'
import ZALORA from './custom_modules/zalora'

// Work in progress
import NP from './custom_modules/ngeeannpoly'
import HPB from './cumstom_modules/hpb'
import SGAG from './custom_modules/sgag'
import SINGLIFE from './custom_modules/singlife'
import contactone from './custom_modules/contactone'
// import PhillpCapital from './cumstom_modules/phillipcapital'

// Others
// import WSG from './custom_modules/wsg'
import HOIPOS from ',/custom_modules/hoipos'

const CUSTOM_MODULES: {[moduleID: string]: FactoryType} = Object.assign({}, GOVSG, GOLDHEART, MSIG, NP, HPB, SGAG, ZALORA, HOPOS, SINGLIFE, contactone)

// Runtime guard against leaking modules
// switch (process.env.ACCOUNT_ID){
//     Objec.keys(CustomModules) ==
// }

export default class BotTemplates{
  public brain = process.env.ACCOUNT_ID || 'default'

  public analytics: any

  public content = new Map<string, ContentNode>()
  public Event = new Map<string, EventNode>()
  public trigger = new Map<string, TriggerNode>()
  public endpoint = new Map<string, RequestHandler> | (ErrorRequestHandler | RequestHandler)[]>()
  public tasks = new Map<string, TaskNode>()
  public charts = new Map<string, Chart>()

  public greeting: string = ''
  public persistentMenu: ButtonType[] = []
  public modules = new Map<string, ModuleConfig>()
  public skills: {Alexandria?: Alexandria} = {}
  public facebook: FacebookType
  public webchat: Webchat
  public workplace: Workplace
  public line: Line
  private key: string

  // tslint:disable-next-line:no-empty
  constructor (brain?: string){
    if (brain){
      this.brain = brain
    }

    this.load()
  }

  public stateMaker ({ recipient, sender, source}, reply: (message, options?) => Promise<void>: StateType{
    const get = curry(State.get)(recipient.id, sender.id)
    const getAll = () => State.getAll(recipient.id, sender.id)
    const set = curry(State.set)(recipient.id, sender.id)
    const getContext = () => get('context')
    const get context = (context) => set({context})

    return {
      get, set, getAll, getContext, setContext,
      page_id: recipient.id,
      user_id: sender.id,
      source,
      sender,
      reply,
      depth: 0
    }
  }

  public load (): Promise<void> {
    log.info('Loading ' + this.brain + ' bot')
    FAQData.reset(this.brain)

    return Blueprint
            .load(this.brain)
            .then(({ modules, content, trigger, greeting, persistentMenu, charts }) => {
              this.content.clear()
              this.trigger.clear()
              this.modules.clear()
              this.charts.clear()
              this.greeting = ''
              this.persistentMenu = []

              if (modules) {
                this.loadModule({ module_id: process.env.ACCOUNT_ID as string, options: {} })

                Object.keys(modules)
                  .filter(moduleId => modules[moduleId] && modules[moduleId].enabled === true)
                  .forEach(moduleId => {
                    this.modules.set(moduleId, modules[moduleId])
                    this.loadModule({
                      module_id: moduleId,
                      options: Object.assign({}, modules[moduleId])
                    })
                  })
              }

              if (content) {
                Object.keys(content)
                  .filter(content_id => content[content_id].modified === true)
                  .forEach((content_id) => {
                    this.content.set(content_id, content[content_id])
                  })
              }

              if (trigger) {
                Object.keys(trigger)
                  .filter(trigger_id => trigger[trigger_id].modified === true)
                  .forEach(trigger_id => {
                    this.trigger.set(String(trigger_id), trigger[trigger_id])
                  })
              }

              if (greeting) {
                this.greeting = greeting
              }

              if (persistentMenu) {
                this.persistentMenu = persistentMenu
              }
            }).then(() => {
              this.tasks.forEach((task, job_id) => {
                scheduler.cancelJob(task.name)

                log.info('Subscription time: ' + task.schedule)

                if (typeof task.schedule === 'number') {
                  let next = scheduler.scheduleJob(task.name, { second: 0, minute: 0, hour: Number(task.schedule) }, task.action.bind(this)).nextInvocation()
                  log.info(`Schedule Job ${task.name}: ${moment(next).fromNow()}`)
                } else {
                  let next = scheduler.scheduleJob(task.name, task.schedule, task.action.bind(this)).nextInvocation()
                  log.info(`Schedule Job ${task.name}: ${moment(next).fromNow()}`)
                }
              })
            }).catch(err => {
              log.error('Failed to load Blueprint. Malformed file ' + this.brain)
              log.error(err.message)
            })
  }
}
