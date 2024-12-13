create schema media_center;
set search_path to media_center;

create table account
(
    id       serial primary key,
    account  text,
    pwd      text,
    need_pwd boolean
);
comment on table account is '账户表';

create table "user"
(
    id         serial primary key,
    name       text,
    gender     int,
    birth_date timestamptz
);
comment on table "user" is '用户表';
comment on column "user".gender is '0:女 1:男';

create table role
(
    id   serial primary key,
    name text
);

create table relation_user_role
(
    id      serial primary key,
    user_id int,
    role_id int
);
comment on table relation_user_role is 'user 与 role关联';

create table video
(
    id           serial primary key,
    title        text,
    release_year int,
    cover_img    text,
    path         text
);

create table video_tag
(
    id   serial primary key,
    name text
);

create table relation_video_tag
(
    id       serial primary key,
    video_id int,
    tag_id   int
);
comment on table relation_video_tag is 'video 与 video_tag 关联';

create table relation
(
    id      serial primary key,
    tabla_a text,
    table_b text,
    id_a    int,
    id_b    int
);
comment on table relation is '通用关联表';
