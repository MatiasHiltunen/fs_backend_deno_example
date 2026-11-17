import { defineContract, now } from '@prisma/orm-postgres/contract-builder';

/*
Example of a task with subtasks:
{
    "id": 1,
    "title": "hello world",
    "description": "",
    "done": false,
    "subtaskFor": null,
    "subtasks": [
        {
            "id": 2,
            "title": "hello world",
            "description": "",
            "done": true,
            "subtaskFor": 1,
            "subtasks": []
        },
        {
            "id": 3,
            "title": "hello world",
            "description": "",
            "done": false,
            "subtaskFor": 1,
            "subtasks": []
        }
    ]
} */

export const contract = defineContract({}, ({ field, model, rel, gen, type }) => {
  const User = model('User', {
    fields: {
      id: field.column(type.Uuid()).id().onCreate(gen.uuid(7)),
      email: field.column(type.String()).unique(),
      username: field.column(type.String()).optional(),
      name: field.column(type.String()).optional(),
      createdAt: field.column(type.DateTime()).default(now()).onCreate(gen.now()),
      updatedAt: field.column(type.temporal.UpdatedAt()),
    },
  });

  const Task = model('Task', {
    fields: {
      id: field.column(type.Uuid()).id().onCreate(gen.uuid(7)),
      title: field.column(type.String()),
      content: field.column(type.String()).optional(),
      createdBy: field.column(type.Uuid()),
      createdAt: field.column(type.DateTime()).default(now()).onCreate(gen.now()),
      updatedAt: field.column(type.temporal.UpdatedAt()),
    },
  });

  return {
    models: {
      User: User.relations({
        tasks: rel.hasMany(Task, { by: 'createdBy' }),
      }),
      Task: Task.relations({
        createdBy: rel.belongsTo(User, { from: 'createdBy', to: 'id' }),
      }),
    },
  };
});
