// lang.js — CapeSearch multi-language support
// Supported: en 🇺🇸 | es 🇪🇸 | fr 🇫🇷 | de 🇩🇪 | pt 🇧🇷 | ru 🇷🇺 | zh 🇨🇳 | ja 🇯🇵
//
// HTML usage:  data-i18n="key"         → sets element.textContent
//              data-i18n-ph="key"      → sets input placeholder
// JS  usage:   window.__t('key')       → returns translated string
// Preference stored in localStorage as 'cs-lang'

(function () {
  'use strict';

  var LANGS = [
    { code: 'en', flag: '🇺🇸', name: 'English'   },
    { code: 'es', flag: '🇪🇸', name: 'Español'   },
    { code: 'fr', flag: '🇫🇷', name: 'Français'  },
    { code: 'de', flag: '🇩🇪', name: 'Deutsch'   },
    { code: 'pt', flag: '🇧🇷', name: 'Português' },
    { code: 'ru', flag: '🇷🇺', name: 'Русский'   },
    { code: 'zh', flag: '🇨🇳', name: '中文'       },
    { code: 'ja', flag: '🇯🇵', name: '日本語'     },
  ];

  // ── Translation table ──────────────────────────────────────────────────────
  var T = {
    en: {
      'nav.home':'Home','nav.capes':'Capes','nav.servers':'Servers',
      'nav.skins':'Skins','nav.faq':'FAQ','nav.login':'Log in','nav.admin':'Admin',
      'nav.search':'Search player...',
      'index.hero_sub':'Connect to our Minecraft server to claim your profile',
      'index.stat_players':'Players Tracked','index.stat_changes':'Cape Changes Today',
      'index.stat_capes':'Capes Tracked','index.stat_skins':'Skins Database',
      'index.recent_changes':'Recent Cape Changes','index.popular_accounts':'Popular Accounts',
      'index.view_all':'View All',
      'index.no_cape_data':'No recent cape data yet — check back soon.',
      'index.no_profiles':'No profile views recorded yet.',
      'faq.title':'Frequently Asked Questions',
      'faq.q1':'What is CapeSearch?',
      'faq.a1':'CapeSearch is a comprehensive Minecraft player tracking platform. You can look up any player\'s current cape, skin, name history, and cape change history in real time. We index millions of players and track cape changes as they happen across Java and Bedrock editions.',
      'faq.q2':'How often is player data updated?',
      'faq.a2':'Player profiles are updated automatically whenever a player is looked up, and our background polling system continuously checks popular players for cape and skin changes. Most active players have data that is no more than a few minutes old at any given time.',
      'faq.q3':'How do I claim my profile?',
      'faq.a3':'To claim your Minecraft profile, log in or create a CapeSearch account using the button in the top right. Then search for your Minecraft username and click the "Claim Profile" button. You\'ll receive a short code to type in-game on our verification server, and your profile will be linked instantly.',
      'faq.q4':'Why is my cape not showing up?',
      'faq.a4':'If your cape isn\'t showing on your profile, try searching for your username to trigger a fresh data fetch from Mojang\'s servers. Changes can sometimes take a few minutes to propagate.',
      'faq.q5':'How do I hide my previous usernames?',
      'footer.tagline':'Most comprehensive Minecraft player tracking. Not affiliated with Mojang or Microsoft.',
      'footer.copyright':'Copyright © 2026 NameSearch. All rights reserved.',
      'footer.col_players':'Players','footer.search_players':'Search Players',
      'footer.name_history':'Name History','footer.uuid_lookup':'UUID Lookup',
      'footer.skin_library':'Skin Library','footer.col_capes':'Capes',
      'footer.all_capes':'All Capes','footer.recent_changes':'Recent Changes',
      'footer.rarest_capes':'Rarest Capes','footer.bedrock_capes':'Bedrock Capes',
      'footer.col_more':'More','footer.servers':'Servers','footer.api':'API','footer.about':'About',
      'capes.title':'All Minecraft Capes','capes.subtitle':'Browse every cape available in Minecraft Java Edition',
      'capes.wearers':'wearers','capes.filter_all':'All','capes.filter_rare':'Rare','capes.filter_common':'Common',
      'capes.sort_label':'Sort:','capes.sort_popular':'Most Popular','capes.sort_rare':'Rarest First',
      'servers.page_title':'Servers','servers.page_sub':'Discover and promote Minecraft servers on CapeSearch.',
      'servers.promote':'Promote Your Server',
      'servers.promote_sub':'Interested in featuring your Minecraft server on CapeSearch? Open a ticket in our Discord and our team will get back to you.',
      'servers.discord_btn':'Open a Discord Ticket',
      'servers.coming_soon':'Server listings coming soon — stay tuned!',
      'common.loading':'Loading…','common.follow':'Follow','common.unfollow':'Unfollow',
      'common.followers':'Followers','common.following':'Following',
    },
    es: {
      'nav.home':'Inicio','nav.capes':'Capas','nav.servers':'Servidores',
      'nav.skins':'Skins','nav.faq':'Preguntas','nav.login':'Iniciar sesión','nav.admin':'Admin',
      'nav.search':'Buscar jugador...',
      'index.hero_sub':'Conéctate a nuestro servidor de Minecraft para reclamar tu perfil',
      'index.stat_players':'Jugadores Rastreados','index.stat_changes':'Cambios de Capa Hoy',
      'index.stat_capes':'Capas Rastreadas','index.stat_skins':'Base de Datos de Skins',
      'index.recent_changes':'Cambios Recientes de Capa','index.popular_accounts':'Cuentas Populares',
      'index.view_all':'Ver Todo',
      'index.no_cape_data':'Sin datos de capas recientes — vuelve pronto.',
      'index.no_profiles':'No hay vistas de perfil registradas aún.',
      'faq.title':'Preguntas Frecuentes',
      'faq.q1':'¿Qué es CapeSearch?',
      'faq.a1':'CapeSearch es una plataforma completa de seguimiento de jugadores de Minecraft. Puedes buscar la capa actual de cualquier jugador, skin, historial de nombres y historial de cambios de capa en tiempo real.',
      'faq.q2':'¿Con qué frecuencia se actualizan los datos?',
      'faq.a2':'Los perfiles de jugadores se actualizan automáticamente cada vez que se busca un jugador, y nuestro sistema de sondeo verifica continuamente los jugadores populares.',
      'faq.q3':'¿Cómo reclamo mi perfil?',
      'faq.a3':'Para reclamar tu perfil de Minecraft, inicia sesión o crea una cuenta de CapeSearch. Busca tu nombre de usuario y haz clic en "Reclamar Perfil". Recibirás un código corto para escribir en el servidor de verificación.',
      'faq.q4':'¿Por qué no aparece mi capa?',
      'faq.a4':'Si tu capa no aparece en tu perfil, intenta buscar tu nombre de usuario para activar una actualización de los servidores de Mojang.',
      'faq.q5':'¿Cómo oculto mis nombres anteriores?',
      'footer.tagline':'El rastreo de jugadores de Minecraft más completo. No afiliado con Mojang o Microsoft.',
      'footer.copyright':'Copyright © 2026 NameSearch. Todos los derechos reservados.',
      'footer.col_players':'Jugadores','footer.search_players':'Buscar Jugadores',
      'footer.name_history':'Historial de Nombres','footer.uuid_lookup':'Búsqueda UUID',
      'footer.skin_library':'Biblioteca de Skins','footer.col_capes':'Capas',
      'footer.all_capes':'Todas las Capas','footer.recent_changes':'Cambios Recientes',
      'footer.rarest_capes':'Capas más Raras','footer.bedrock_capes':'Capas de Bedrock',
      'footer.col_more':'Más','footer.servers':'Servidores','footer.api':'API','footer.about':'Acerca de',
      'capes.title':'Todas las Capas de Minecraft','capes.subtitle':'Explora todas las capas disponibles en Minecraft Java Edition',
      'capes.wearers':'portadores','capes.filter_all':'Todas','capes.filter_rare':'Raras','capes.filter_common':'Comunes',
      'capes.sort_label':'Ordenar:','capes.sort_popular':'Más Populares','capes.sort_rare':'Más Raras Primero',
      'servers.page_title':'Servidores','servers.page_sub':'Descubre y promociona servidores de Minecraft en CapeSearch.',
      'servers.promote':'Promociona Tu Servidor',
      'servers.promote_sub':'¿Interesado en destacar tu servidor de Minecraft en CapeSearch? Abre un ticket en nuestro Discord y nuestro equipo te responderá.',
      'servers.discord_btn':'Abrir un Ticket de Discord',
      'servers.coming_soon':'Listados de servidores próximamente — ¡estate atento!',
      'common.loading':'Cargando…','common.follow':'Seguir','common.unfollow':'Dejar de seguir',
      'common.followers':'Seguidores','common.following':'Siguiendo',
    },
    fr: {
      'nav.home':'Accueil','nav.capes':'Capes','nav.servers':'Serveurs',
      'nav.skins':'Skins','nav.faq':'FAQ','nav.login':'Se connecter','nav.admin':'Admin',
      'nav.search':'Chercher un joueur...',
      'index.hero_sub':'Connectez-vous à notre serveur Minecraft pour revendiquer votre profil',
      'index.stat_players':'Joueurs Suivis','index.stat_changes':'Changements de Cape Aujourd\'hui',
      'index.stat_capes':'Capes Suivies','index.stat_skins':'Base de Données de Skins',
      'index.recent_changes':'Changements de Cape Récents','index.popular_accounts':'Comptes Populaires',
      'index.view_all':'Voir Tout',
      'index.no_cape_data':'Aucune donnée de cape récente — revenez bientôt.',
      'index.no_profiles':'Aucune vue de profil enregistrée pour l\'instant.',
      'faq.title':'Questions Fréquemment Posées',
      'faq.q1':'Qu\'est-ce que CapeSearch ?',
      'faq.a1':'CapeSearch est une plateforme complète de suivi des joueurs Minecraft. Vous pouvez rechercher la cape actuelle de n\'importe quel joueur, son skin, son historique de noms et l\'historique des changements de cape en temps réel.',
      'faq.q2':'À quelle fréquence les données sont-elles mises à jour ?',
      'faq.a2':'Les profils des joueurs sont mis à jour automatiquement chaque fois qu\'un joueur est recherché, et notre système de surveillance vérifie continuellement les joueurs populaires.',
      'faq.q3':'Comment réclamer mon profil ?',
      'faq.a3':'Pour réclamer votre profil Minecraft, connectez-vous ou créez un compte CapeSearch. Cherchez votre nom d\'utilisateur et cliquez sur "Réclamer le profil". Vous recevrez un code court à taper en jeu.',
      'faq.q4':'Pourquoi ma cape n\'apparaît pas ?',
      'faq.a4':'Si votre cape n\'apparaît pas sur votre profil, essayez de rechercher votre nom d\'utilisateur pour déclencher une actualisation des serveurs de Mojang.',
      'faq.q5':'Comment masquer mes anciens noms d\'utilisateur ?',
      'footer.tagline':'Suivi le plus complet des joueurs Minecraft. Non affilié à Mojang ou Microsoft.',
      'footer.copyright':'Copyright © 2026 NameSearch. Tous droits réservés.',
      'footer.col_players':'Joueurs','footer.search_players':'Rechercher des Joueurs',
      'footer.name_history':'Historique des Noms','footer.uuid_lookup':'Recherche UUID',
      'footer.skin_library':'Bibliothèque de Skins','footer.col_capes':'Capes',
      'footer.all_capes':'Toutes les Capes','footer.recent_changes':'Changements Récents',
      'footer.rarest_capes':'Capes les Plus Rares','footer.bedrock_capes':'Capes Bedrock',
      'footer.col_more':'Plus','footer.servers':'Serveurs','footer.api':'API','footer.about':'À propos',
      'capes.title':'Toutes les Capes Minecraft','capes.subtitle':'Parcourez toutes les capes disponibles dans Minecraft Java Edition',
      'capes.wearers':'porteurs','capes.filter_all':'Toutes','capes.filter_rare':'Rares','capes.filter_common':'Communes',
      'capes.sort_label':'Trier :','capes.sort_popular':'Plus Populaires','capes.sort_rare':'Les Plus Rares D\'abord',
      'servers.page_title':'Serveurs','servers.page_sub':'Découvrez et promouvez des serveurs Minecraft sur CapeSearch.',
      'servers.promote':'Promouvez Votre Serveur',
      'servers.promote_sub':'Intéressé par la mise en avant de votre serveur Minecraft sur CapeSearch ? Ouvrez un ticket sur notre Discord et notre équipe vous répondra.',
      'servers.discord_btn':'Ouvrir un Ticket Discord',
      'servers.coming_soon':'Listes de serveurs bientôt disponibles — restez à l\'écoute !',
      'common.loading':'Chargement…','common.follow':'Suivre','common.unfollow':'Ne plus suivre',
      'common.followers':'Abonnés','common.following':'Abonnements',
    },
    de: {
      'nav.home':'Startseite','nav.capes':'Capes','nav.servers':'Server',
      'nav.skins':'Skins','nav.faq':'FAQ','nav.login':'Anmelden','nav.admin':'Admin',
      'nav.search':'Spieler suchen...',
      'index.hero_sub':'Verbinde dich mit unserem Minecraft-Server, um dein Profil zu beanspruchen',
      'index.stat_players':'Verfolgte Spieler','index.stat_changes':'Cape-Änderungen Heute',
      'index.stat_capes':'Verfolgte Capes','index.stat_skins':'Skins-Datenbank',
      'index.recent_changes':'Aktuelle Cape-Änderungen','index.popular_accounts':'Beliebte Accounts',
      'index.view_all':'Alle anzeigen',
      'index.no_cape_data':'Noch keine aktuellen Cape-Daten — schau bald wieder vorbei.',
      'index.no_profiles':'Noch keine Profilaufrufe aufgezeichnet.',
      'faq.title':'Häufig Gestellte Fragen',
      'faq.q1':'Was ist CapeSearch?',
      'faq.a1':'CapeSearch ist eine umfassende Minecraft-Spieler-Tracking-Plattform. Du kannst das aktuelle Cape, den Skin, den Namensverlauf und den Cape-Änderungsverlauf jedes Spielers in Echtzeit nachschlagen.',
      'faq.q2':'Wie oft werden die Spielerdaten aktualisiert?',
      'faq.a2':'Spielerprofile werden automatisch aktualisiert, wenn ein Spieler nachgeschlagen wird, und unser Hintergrund-Polling-System überprüft kontinuierlich beliebte Spieler.',
      'faq.q3':'Wie beanspruche ich mein Profil?',
      'faq.a3':'Um dein Minecraft-Profil zu beanspruchen, melde dich an oder erstelle ein CapeSearch-Konto. Suche dann nach deinem Benutzernamen und klicke auf "Profil beanspruchen". Du erhältst einen kurzen Code, den du im Spiel eingeben musst.',
      'faq.q4':'Warum wird mein Cape nicht angezeigt?',
      'faq.a4':'Wenn dein Cape nicht auf deinem Profil angezeigt wird, versuche, deinen Benutzernamen zu suchen, um einen neuen Datenabruf von Mojangs Servern auszulösen.',
      'faq.q5':'Wie verberge ich meine früheren Benutzernamen?',
      'footer.tagline':'Umfassendstes Minecraft-Spieler-Tracking. Nicht mit Mojang oder Microsoft verbunden.',
      'footer.copyright':'Copyright © 2026 NameSearch. Alle Rechte vorbehalten.',
      'footer.col_players':'Spieler','footer.search_players':'Spieler Suchen',
      'footer.name_history':'Namensverlauf','footer.uuid_lookup':'UUID-Suche',
      'footer.skin_library':'Skin-Bibliothek','footer.col_capes':'Capes',
      'footer.all_capes':'Alle Capes','footer.recent_changes':'Aktuelle Änderungen',
      'footer.rarest_capes':'Seltenste Capes','footer.bedrock_capes':'Bedrock-Capes',
      'footer.col_more':'Mehr','footer.servers':'Server','footer.api':'API','footer.about':'Über uns',
      'capes.title':'Alle Minecraft-Capes','capes.subtitle':'Durchsuche alle Capes in Minecraft Java Edition',
      'capes.wearers':'Träger','capes.filter_all':'Alle','capes.filter_rare':'Selten','capes.filter_common':'Häufig',
      'capes.sort_label':'Sortieren:','capes.sort_popular':'Am Beliebtesten','capes.sort_rare':'Seltenste Zuerst',
      'servers.page_title':'Server','servers.page_sub':'Entdecke und bewirb Minecraft-Server auf CapeSearch.',
      'servers.promote':'Bewirb Deinen Server',
      'servers.promote_sub':'Möchtest du deinen Minecraft-Server auf CapeSearch hervorheben? Öffne ein Ticket in unserem Discord und unser Team meldet sich bei dir.',
      'servers.discord_btn':'Discord-Ticket Öffnen',
      'servers.coming_soon':'Server-Listings kommen bald — bleib dran!',
      'common.loading':'Wird geladen…','common.follow':'Folgen','common.unfollow':'Entfolgen',
      'common.followers':'Follower','common.following':'Folge ich',
    },
    pt: {
      'nav.home':'Início','nav.capes':'Capas','nav.servers':'Servidores',
      'nav.skins':'Skins','nav.faq':'FAQ','nav.login':'Entrar','nav.admin':'Admin',
      'nav.search':'Buscar jogador...',
      'index.hero_sub':'Conecte-se ao nosso servidor Minecraft para reivindicar seu perfil',
      'index.stat_players':'Jogadores Rastreados','index.stat_changes':'Mudanças de Capa Hoje',
      'index.stat_capes':'Capas Rastreadas','index.stat_skins':'Banco de Dados de Skins',
      'index.recent_changes':'Mudanças Recentes de Capa','index.popular_accounts':'Contas Populares',
      'index.view_all':'Ver Tudo',
      'index.no_cape_data':'Nenhum dado de capa recente — volte em breve.',
      'index.no_profiles':'Nenhuma visualização de perfil registrada ainda.',
      'faq.title':'Perguntas Frequentes',
      'faq.q1':'O que é o CapeSearch?',
      'faq.a1':'CapeSearch é uma plataforma abrangente de rastreamento de jogadores Minecraft. Você pode pesquisar a capa atual de qualquer jogador, skin, histórico de nomes e histórico de mudanças de capa em tempo real.',
      'faq.q2':'Com que frequência os dados são atualizados?',
      'faq.a2':'Os perfis dos jogadores são atualizados automaticamente sempre que um jogador é pesquisado, e nosso sistema de monitoramento verifica continuamente os jogadores populares.',
      'faq.q3':'Como reivindico meu perfil?',
      'faq.a3':'Para reivindicar seu perfil Minecraft, faça login ou crie uma conta CapeSearch. Pesquise seu nome de usuário e clique em "Reivindicar Perfil". Você receberá um código curto para digitar no jogo.',
      'faq.q4':'Por que minha capa não está aparecendo?',
      'faq.a4':'Se sua capa não está aparecendo no seu perfil, tente pesquisar seu nome de usuário para acionar uma nova busca nos servidores da Mojang.',
      'faq.q5':'Como oculto meus nomes de usuário anteriores?',
      'footer.tagline':'Rastreamento mais completo de jogadores de Minecraft. Não afiliado à Mojang ou Microsoft.',
      'footer.copyright':'Copyright © 2026 NameSearch. Todos os direitos reservados.',
      'footer.col_players':'Jogadores','footer.search_players':'Buscar Jogadores',
      'footer.name_history':'Histórico de Nomes','footer.uuid_lookup':'Busca UUID',
      'footer.skin_library':'Biblioteca de Skins','footer.col_capes':'Capas',
      'footer.all_capes':'Todas as Capas','footer.recent_changes':'Mudanças Recentes',
      'footer.rarest_capes':'Capas mais Raras','footer.bedrock_capes':'Capas Bedrock',
      'footer.col_more':'Mais','footer.servers':'Servidores','footer.api':'API','footer.about':'Sobre',
      'capes.title':'Todas as Capas Minecraft','capes.subtitle':'Explore todas as capas disponíveis no Minecraft Java Edition',
      'capes.wearers':'usuários','capes.filter_all':'Todas','capes.filter_rare':'Raras','capes.filter_common':'Comuns',
      'capes.sort_label':'Ordenar:','capes.sort_popular':'Mais Populares','capes.sort_rare':'Mais Raras Primeiro',
      'servers.page_title':'Servidores','servers.page_sub':'Descubra e promova servidores Minecraft no CapeSearch.',
      'servers.promote':'Promova Seu Servidor',
      'servers.promote_sub':'Interessado em destacar seu servidor Minecraft no CapeSearch? Abra um ticket no nosso Discord e nossa equipe retornará.',
      'servers.discord_btn':'Abrir um Ticket Discord',
      'servers.coming_soon':'Listagens de servidores em breve — fique atento!',
      'common.loading':'Carregando…','common.follow':'Seguir','common.unfollow':'Deixar de seguir',
      'common.followers':'Seguidores','common.following':'Seguindo',
    },
    ru: {
      'nav.home':'Главная','nav.capes':'Плащи','nav.servers':'Серверы',
      'nav.skins':'Скины','nav.faq':'FAQ','nav.login':'Войти','nav.admin':'Админ',
      'nav.search':'Найти игрока...',
      'index.hero_sub':'Подключитесь к нашему серверу Minecraft, чтобы заявить права на профиль',
      'index.stat_players':'Отслеживаемые Игроки','index.stat_changes':'Смены Плащей Сегодня',
      'index.stat_capes':'Отслеживаемые Плащи','index.stat_skins':'База Скинов',
      'index.recent_changes':'Последние Смены Плащей','index.popular_accounts':'Популярные Аккаунты',
      'index.view_all':'Смотреть все',
      'index.no_cape_data':'Нет недавних данных о плащах — проверьте позже.',
      'index.no_profiles':'Просмотры профилей ещё не записаны.',
      'faq.title':'Часто Задаваемые Вопросы',
      'faq.q1':'Что такое CapeSearch?',
      'faq.a1':'CapeSearch — это комплексная платформа отслеживания игроков Minecraft. Вы можете найти текущий плащ любого игрока, скин, историю имён и историю смен плащей в реальном времени.',
      'faq.q2':'Как часто обновляются данные?',
      'faq.a2':'Профили игроков обновляются автоматически при каждом поиске, а наша фоновая система опроса непрерывно проверяет популярных игроков.',
      'faq.q3':'Как заявить права на профиль?',
      'faq.a3':'Чтобы заявить права на профиль Minecraft, войдите в систему или создайте аккаунт CapeSearch. Найдите своё имя пользователя и нажмите кнопку "Заявить профиль". Вы получите короткий код для ввода в игре.',
      'faq.q4':'Почему мой плащ не отображается?',
      'faq.a4':'Если ваш плащ не отображается в профиле, попробуйте выполнить поиск по имени пользователя для обновления данных с серверов Mojang.',
      'faq.q5':'Как скрыть предыдущие имена?',
      'footer.tagline':'Самый полный трекинг игроков Minecraft. Не аффилирован с Mojang или Microsoft.',
      'footer.copyright':'Copyright © 2026 NameSearch. Все права защищены.',
      'footer.col_players':'Игроки','footer.search_players':'Поиск Игроков',
      'footer.name_history':'История Имён','footer.uuid_lookup':'Поиск UUID',
      'footer.skin_library':'Библиотека Скинов','footer.col_capes':'Плащи',
      'footer.all_capes':'Все Плащи','footer.recent_changes':'Последние Изменения',
      'footer.rarest_capes':'Редчайшие Плащи','footer.bedrock_capes':'Плащи Bedrock',
      'footer.col_more':'Ещё','footer.servers':'Серверы','footer.api':'API','footer.about':'О нас',
      'capes.title':'Все Плащи Minecraft','capes.subtitle':'Просматривайте все плащи в Minecraft Java Edition',
      'capes.wearers':'носителей','capes.filter_all':'Все','capes.filter_rare':'Редкие','capes.filter_common':'Обычные',
      'capes.sort_label':'Сортировка:','capes.sort_popular':'Самые Популярные','capes.sort_rare':'Сначала Редкие',
      'servers.page_title':'Серверы','servers.page_sub':'Открывайте и продвигайте серверы Minecraft на CapeSearch.',
      'servers.promote':'Продвигайте Свой Сервер',
      'servers.promote_sub':'Хотите продвинуть свой сервер Minecraft на CapeSearch? Откройте тикет в нашем Discord и наша команда ответит вам.',
      'servers.discord_btn':'Открыть Тикет Discord',
      'servers.coming_soon':'Списки серверов скоро — следите за обновлениями!',
      'common.loading':'Загрузка…','common.follow':'Подписаться','common.unfollow':'Отписаться',
      'common.followers':'Подписчики','common.following':'Подписки',
    },
    zh: {
      'nav.home':'首页','nav.capes':'披风','nav.servers':'服务器',
      'nav.skins':'皮肤','nav.faq':'常见问题','nav.login':'登录','nav.admin':'管理',
      'nav.search':'搜索玩家...',
      'index.hero_sub':'连接到我们的Minecraft服务器以认领您的档案',
      'index.stat_players':'已追踪玩家','index.stat_changes':'今日披风变更',
      'index.stat_capes':'已追踪披风','index.stat_skins':'皮肤数据库',
      'index.recent_changes':'最近披风变更','index.popular_accounts':'热门账户',
      'index.view_all':'查看全部',
      'index.no_cape_data':'暂无披风数据 — 请稍后再试。',
      'index.no_profiles':'暂无档案浏览记录。',
      'faq.title':'常见问题解答',
      'faq.q1':'什么是CapeSearch？',
      'faq.a1':'CapeSearch是一个全面的Minecraft玩家追踪平台。您可以实时查找任何玩家的当前披风、皮肤、名称历史和披风变更历史。',
      'faq.q2':'玩家数据多久更新一次？',
      'faq.a2':'每次查找玩家时，玩家档案都会自动更新，我们的后台轮询系统会持续检查热门玩家的变化。',
      'faq.q3':'如何认领我的档案？',
      'faq.a3':'要认领您的Minecraft档案，请登录或创建CapeSearch账户。搜索您的用户名并点击"认领档案"按钮。您将收到一个短代码，在验证服务器上输入即可。',
      'faq.q4':'为什么我的披风没有显示？',
      'faq.a4':'如果您的披风没有出现在档案上，请尝试搜索您的用户名以从Mojang服务器获取新数据。',
      'faq.q5':'如何隐藏我以前的用户名？',
      'footer.tagline':'最全面的Minecraft玩家追踪。与Mojang或Microsoft无关联。',
      'footer.copyright':'版权所有 © 2026 NameSearch. 保留所有权利。',
      'footer.col_players':'玩家','footer.search_players':'搜索玩家',
      'footer.name_history':'名称历史','footer.uuid_lookup':'UUID查找',
      'footer.skin_library':'皮肤库','footer.col_capes':'披风',
      'footer.all_capes':'所有披风','footer.recent_changes':'最近变更',
      'footer.rarest_capes':'最稀有披风','footer.bedrock_capes':'基岩版披风',
      'footer.col_more':'更多','footer.servers':'服务器','footer.api':'API','footer.about':'关于',
      'capes.title':'所有Minecraft披风','capes.subtitle':'浏览Minecraft Java版中所有可用的披风',
      'capes.wearers':'使用者','capes.filter_all':'全部','capes.filter_rare':'稀有','capes.filter_common':'普通',
      'capes.sort_label':'排序:','capes.sort_popular':'最受欢迎','capes.sort_rare':'最稀有优先',
      'servers.page_title':'服务器','servers.page_sub':'在CapeSearch上发现和推广Minecraft服务器。',
      'servers.promote':'推广您的服务器',
      'servers.promote_sub':'有兴趣在CapeSearch上推广您的Minecraft服务器吗？在我们的Discord上开一个工单，我们的团队会回复您。',
      'servers.discord_btn':'开Discord工单',
      'servers.coming_soon':'服务器列表即将推出 — 敬请期待！',
      'common.loading':'加载中…','common.follow':'关注','common.unfollow':'取消关注',
      'common.followers':'粉丝','common.following':'关注中',
    },
    ja: {
      'nav.home':'ホーム','nav.capes':'マント','nav.servers':'サーバー',
      'nav.skins':'スキン','nav.faq':'よくある質問','nav.login':'ログイン','nav.admin':'管理',
      'nav.search':'プレイヤーを検索...',
      'index.hero_sub':'プロフィールを申請するには、Minecraftサーバーに接続してください',
      'index.stat_players':'追跡中のプレイヤー','index.stat_changes':'本日のマント変更',
      'index.stat_capes':'追跡中のマント','index.stat_skins':'スキンデータベース',
      'index.recent_changes':'最近のマント変更','index.popular_accounts':'人気アカウント',
      'index.view_all':'すべて表示',
      'index.no_cape_data':'最近のマントデータはまだありません — 後でご確認ください。',
      'index.no_profiles':'まだプロフィールの閲覧記録がありません。',
      'faq.title':'よくある質問',
      'faq.q1':'CapeSearchとは何ですか？',
      'faq.a1':'CapeSearchは包括的なMinecraftプレイヤー追跡プラットフォームです。任意のプレイヤーの現在のマント、スキン、名前の履歴、マント変更履歴をリアルタイムで検索できます。',
      'faq.q2':'プレイヤーデータはどのくらいの頻度で更新されますか？',
      'faq.a2':'プレイヤーが検索されるたびにプロフィールが自動的に更新され、バックグラウンドのポーリングシステムが人気プレイヤーを継続的に確認します。',
      'faq.q3':'プロフィールを申請するには？',
      'faq.a3':'Minecraftプロフィールを申請するには、ログインまたはCapeSearchアカウントを作成してください。ユーザー名を検索して「プロフィールを申請」ボタンをクリックします。確認サーバーで入力する短いコードが届きます。',
      'faq.q4':'マントが表示されないのはなぜですか？',
      'faq.a4':'マントがプロフィールに表示されない場合は、ユーザー名を検索してMojangのサーバーから新しいデータを取得してみてください。',
      'faq.q5':'以前のユーザー名を非表示にするには？',
      'footer.tagline':'最も包括的なMinecraftプレイヤートラッキング。MojangまたはMicrosoftとは無関係です。',
      'footer.copyright':'Copyright © 2026 NameSearch. All rights reserved.',
      'footer.col_players':'プレイヤー','footer.search_players':'プレイヤー検索',
      'footer.name_history':'名前履歴','footer.uuid_lookup':'UUID検索',
      'footer.skin_library':'スキンライブラリ','footer.col_capes':'マント',
      'footer.all_capes':'すべてのマント','footer.recent_changes':'最近の変更',
      'footer.rarest_capes':'最も希少なマント','footer.bedrock_capes':'Bedrock版マント',
      'footer.col_more':'その他','footer.servers':'サーバー','footer.api':'API','footer.about':'について',
      'capes.title':'すべてのMinecraftマント','capes.subtitle':'Minecraft Java Editionで利用可能なすべてのマントを閲覧',
      'capes.wearers':'装着者','capes.filter_all':'すべて','capes.filter_rare':'レア','capes.filter_common':'一般',
      'capes.sort_label':'並べ替え:','capes.sort_popular':'人気順','capes.sort_rare':'希少順',
      'servers.page_title':'サーバー','servers.page_sub':'CapeSearchでMinecraftサーバーを発見・宣伝しましょう。',
      'servers.promote':'サーバーを宣伝する',
      'servers.promote_sub':'CapeSearchでMinecraftサーバーを宣伝したいですか？Discordでチケットを開いてください。チームが対応します。',
      'servers.discord_btn':'Discordチケットを開く',
      'servers.coming_soon':'サーバーリストは近日公開 — お楽しみに！',
      'common.loading':'読み込み中…','common.follow':'フォロー','common.unfollow':'フォロー解除',
      'common.followers':'フォロワー','common.following':'フォロー中',
    },
  };

  // ── State ──────────────────────────────────────────────────────────────────
  var _lang = localStorage.getItem('cs-lang') || 'en';
  if (!T[_lang]) _lang = 'en';
  var _open = false;

  // ── Exposed translation helper ─────────────────────────────────────────────
  window.__t = function (key, fallback) {
    var d = T[_lang] || T['en'];
    return (d && d[key]) || (T['en'] && T['en'][key]) || fallback || key;
  };

  // ── Store originals once ───────────────────────────────────────────────────
  function storeOriginals() {
    document.querySelectorAll('[data-i18n]').forEach(function (el) {
      if (!el.hasAttribute('data-i18n-orig'))
        el.setAttribute('data-i18n-orig', el.textContent);
    });
    document.querySelectorAll('[data-i18n-ph]').forEach(function (el) {
      if (!el.hasAttribute('data-i18n-ph-orig'))
        el.setAttribute('data-i18n-ph-orig', el.placeholder || '');
    });
  }

  // ── Apply translations to the DOM ─────────────────────────────────────────
  function applyTranslations() {
    storeOriginals();
    var dict = T[_lang] || {};
    document.querySelectorAll('[data-i18n]').forEach(function (el) {
      var key = el.getAttribute('data-i18n');
      var val = _lang === 'en'
        ? el.getAttribute('data-i18n-orig')
        : (dict[key] || (T['en'] && T['en'][key]));
      if (val != null) el.textContent = val;
    });
    document.querySelectorAll('[data-i18n-ph]').forEach(function (el) {
      var key = el.getAttribute('data-i18n-ph');
      var val = _lang === 'en'
        ? el.getAttribute('data-i18n-ph-orig')
        : (dict[key] || (T['en'] && T['en'][key]));
      if (val != null) el.placeholder = val;
    });
    document.documentElement.lang = _lang;
  }

  // ── Build dropdown item list ───────────────────────────────────────────────
  function buildItems() {
    return LANGS.map(function (l) {
      var active = l.code === _lang;
      return '<button class="_li" data-code="' + l.code + '" '
        + 'style="display:flex;align-items:center;gap:.55rem;width:100%;background:none;border:none;'
        + 'padding:.45rem .8rem;cursor:pointer;font-size:.85rem;text-align:left;'
        + 'color:' + (active ? 'var(--green,#4ade80)' : '#f1f5f9') + ';'
        + 'transition:background .12s;white-space:nowrap" '
        + 'onmouseover="this.style.background=\'#182030\'" '
        + 'onmouseout="this.style.background=\'none\'">'
        +   '<span style="font-size:1.15rem;line-height:1">' + l.flag + '</span>'
        +   '<span style="flex:1">' + l.name + '</span>'
        +   (active ? '<span style="font-size:.7rem;margin-left:.25rem;color:var(--green,#4ade80)">✓</span>' : '')
        + '</button>';
    }).join('');
  }

  // ── Attach click listeners to dropdown items ───────────────────────────────
  function attachItemListeners(drop) {
    drop.querySelectorAll('._li').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        setLang(btn.dataset.code);
      });
    });
  }

  // ── Switch language ────────────────────────────────────────────────────────
  function setLang(code) {
    _lang = code;
    localStorage.setItem('cs-lang', code);
    _open = false;

    var drop = document.getElementById('_langDrop');
    if (drop) { drop.style.display = 'none'; drop.innerHTML = buildItems(); attachItemListeners(drop); }

    var curr = LANGS.find(function (l) { return l.code === code; }) || LANGS[0];
    var flagEl = document.getElementById('_lFlag');
    var nameEl = document.getElementById('_lName');
    if (flagEl) flagEl.textContent = curr.flag;
    if (nameEl) nameEl.textContent = curr.name;

    applyTranslations();
  }

  // ── Inject switcher into the nav ───────────────────────────────────────────
  function injectSwitcher() {
    var navIn = document.querySelector('.nav-in');
    if (!navIn || document.getElementById('_langWrap')) return;

    var curr = LANGS.find(function (l) { return l.code === _lang; }) || LANGS[0];

    var wrap = document.createElement('div');
    wrap.id = '_langWrap';
    wrap.style.cssText = 'position:relative;flex-shrink:0;margin-left:.25rem';
    wrap.innerHTML =
        '<button id="_langBtn" title="Change language" '
      +   'style="display:flex;align-items:center;gap:.35rem;background:#182030;'
      +   'border:2px solid #1e293b;border-radius:6px;padding:0 .65rem;height:38px;'
      +   'cursor:pointer;color:#f1f5f9;font-size:.82rem;font-weight:600;'
      +   'transition:border-color .15s;white-space:nowrap" '
      +   'onmouseover="this.style.borderColor=\'var(--green,#4ade80)\'" '
      +   'onmouseout="this.style.borderColor=\'#1e293b\'">'
      +   '<span id="_lFlag" style="font-size:1.15rem;line-height:1">' + curr.flag + '</span>'
      +   '<span id="_lName" style="font-size:.82rem">' + curr.name + '</span>'
      +   '<span style="font-size:.55rem;color:#64748b;margin-left:.1rem">▼</span>'
      + '</button>'
      + '<div id="_langDrop" '
      +   'style="display:none;position:absolute;top:calc(100% + 8px);right:0;'
      +   'background:#131f2e;border:1px solid #1e293b;border-radius:10px;'
      +   'box-shadow:0 16px 48px rgba(0,0,0,.7);min-width:155px;z-index:600;overflow:hidden">'
      +   buildItems()
      + '</div>';

    navIn.appendChild(wrap);

    document.getElementById('_langBtn').addEventListener('click', function (e) {
      e.stopPropagation();
      _open = !_open;
      var drop = document.getElementById('_langDrop');
      if (drop) drop.style.display = _open ? 'block' : 'none';
    });

    attachItemListeners(document.getElementById('_langDrop'));

    document.addEventListener('click', function (e) {
      if (_open && !wrap.contains(e.target)) {
        _open = false;
        var drop = document.getElementById('_langDrop');
        if (drop) drop.style.display = 'none';
      }
    });
  }

  // ── Boot ───────────────────────────────────────────────────────────────────
  // Guard: scripts at the bottom of <body> may execute after DOMContentLoaded
  // has already fired (readyState === 'interactive' | 'complete').
  // Run immediately in that case; otherwise wait for the event.
  function _boot() {
    storeOriginals();
    injectSwitcher();
    applyTranslations();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _boot);
  } else {
    _boot();
  }

})();
