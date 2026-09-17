const assert=require('node:assert/strict');
const {PrismaClient}=require('@prisma/client');
const {createHmac}=require('node:crypto');
// Test fixture signer only: avoid adding a dependency to Next standalone image.
const jwt={sign(payload,secret){
  const encode=v=>Buffer.from(JSON.stringify(v)).toString('base64url');
  const now=Math.floor(Date.now()/1000);
  const body=encode({alg:'HS256',typ:'JWT'})+'.'+encode({...payload,iat:now,exp:now+600});
  return body+'.'+createHmac('sha256',secret).update(body).digest('base64url');
}};
const testUrl=new URL(process.env.DATABASE_URL || '');
assert.equal(testUrl.hostname,'security-db','Only an isolated synthetic database is allowed');
assert.equal(testUrl.pathname,'/synthetic');
assert.equal(process.env.JWT_SECRET,'synthetic-container-test-only-secret');
assert.ok(['lms','prep'].includes(process.argv[2]));
const db=new PrismaClient();
const secret='synthetic-container-test-only-secret';
let app,passed=0;
async function check(name,fn){await fn();passed++;console.log('PASS '+name)}

async function prepTest(){
  const {AssignmentsService}=require('./dist/modules/assignments/assignments.service');
  const {AssignmentsController}=require('./dist/modules/assignments/assignments.controller');
  const {UsersService}=require('./dist/modules/users/users.service');
  const {StudentsService}=require('./dist/modules/students/students.service');
  const {AuthService}=require('./dist/modules/auth/auth.service');
  const {JwtStrategy}=require('./dist/modules/auth/strategies/jwt.strategy');
  const {ConfigService}=require('@nestjs/config');
  const {PassportModule}=require('@nestjs/passport');
  const {Test}=require('@nestjs/testing');
  for(const id of ['teacher-A','teacher-B'])await db.appUser.create({data:{id,firstName:id}});
  for(const id of ['A','B'])await db.class.create({data:{id:'class-'+id,teacherId:'teacher-'+id,name:'Synthetic '+id}});
  for(const [id,c] of [['student-A','A'],['student-B','A'],['student-C','B']])await db.student.create({data:{id,classId:'class-'+c,name:id,passwordHash:'PRIVATE_HASH',notes:'PRIVATE_NOTES'}});
  await db.lesson.create({data:{id:'lesson',userId:'teacher-A',title:'Synthetic test',topic:'Synthetic',notes:'PRIVATE_NOTES'}});
  const output={format:'json-blocks-v1',html:'PRIVATE_CACHED',outputDoc:{schemaVersion:1,type:'worksheet',title:'Synthetic',answers:{q:'ANSWER_SECRET'},blocks:[
    {id:'mc',type:'multiple-choice',question:'Choose',multiple:false,options:[{id:'a',text:'A',correct:true},{id:'b',text:'B',correct:false}]},
    {id:'sa',type:'short-answer',question:'Explain',expectedAnswer:'ANSWER_SECRET'},
    {id:'fb',type:'fill-blank',template:'{{1}}',blanks:[{index:1,answer:'ANSWER_SECRET'}]},
    {id:'match',type:'matching',instruction:'Match',left:[{id:'l1',text:'1'},{id:'l2',text:'2'}],right:[{id:'r1',text:'one'},{id:'r2',text:'two'}],pairs:[['l1','r1'],['l2','r2']]}]}};
  for(const [id,type] of [['gen','worksheet'],['hidden','answer-key']]){
    await db.generationRequest.create({data:{id:'request-'+id,userId:'teacher-A',type,status:'completed'}});
    await db.userGeneration.create({data:{id,userId:'teacher-A',lessonId:'lesson',generationRequestId:'request-'+id,generationType:type,status:'completed',inputParams:{private:'PRIVATE_PROMPT'},outputData:output}});
  }
  await db.assignment.create({data:{id:'group',classId:'class-A',lessonId:'lesson'}});
  await db.assignment.create({data:{id:'direct',studentId:'student-A',lessonId:'lesson',generationId:'gen'}});
  for(const id of ['student-A','student-B'])await db.submission.create({data:{id:'submission-'+id,assignmentId:'group',studentId:id,content:'Work '+id}});
  const service=new AssignmentsService(db,null,null,null,null);
  const auth=new AuthService(new UsersService(db,null),new StudentsService(db,null,null,null,null),null,null,db,null,null,null,null);
  const strategy=new JwtStrategy(new ConfigService({JWT_SECRET:secret}),auth);
  const module=await Test.createTestingModule({imports:[PassportModule.register({defaultStrategy:'jwt'})],controllers:[AssignmentsController],providers:[{provide:AssignmentsService,useValue:service},{provide:JwtStrategy,useValue:strategy}]}).compile();
  app=module.createNestApplication({logger:false});await app.listen(3009,'127.0.0.1');
  const get=(who,id='group')=>fetch('http://127.0.0.1:3009/assignments/'+id,{headers:who?{Authorization:'Bearer '+jwt.sign({sub:who,role:who.startsWith('student')?'student':'teacher'},secret,{expiresIn:'10m'})}:{}});
  await check('missing JWT -> 401',async()=>assert.equal((await get(null)).status,401));
  for(const who of ['student-A','student-B'])await check(who+' receives only own work and no secrets',async()=>{
    const r=await get(who);assert.equal(r.status,200);const v=await r.json();
    assert.deepEqual(v.submissions.map(s=>s.studentId),[who]);assert.deepEqual(v.lesson.generations.map(g=>g.id),['gen']);
    assert.ok(!JSON.stringify(v).includes('PRIVATE_'));assert.ok(!JSON.stringify(v).includes('ANSWER_SECRET'));
    const b=v.lesson.generations[0].outputData.outputDoc.blocks;
    assert.deepEqual(b[0].options.map(o=>o.correct),[false,false]);assert.equal(b[1].expectedAnswer,undefined);assert.equal(b[2].blanks[0].answer,'');assert.deepEqual(b[3].pairs,[]);
  });
  await check('outsider teacher/student -> 404',async()=>{for(const who of ['teacher-B','student-C'])assert.equal((await get(who)).status,404)});
  await check('own teacher retains both works and answers, not password hashes',async()=>{
    const r=await get('teacher-A');assert.equal(r.status,200);const v=await r.json();assert.equal(v.submissions.length,2);assert.ok(JSON.stringify(v).includes('ANSWER_SECRET'));assert.ok(!JSON.stringify(v).includes('PRIVATE_HASH'));
  });
  await check('direct assignment rejects classmate',async()=>{assert.equal((await get('student-A','direct')).status,200);assert.equal((await get('student-B','direct')).status,404)});
  await check('class transfer revokes access',async()=>{await db.student.update({where:{id:'student-A'},data:{classId:'class-B'}});assert.equal((await get('student-A')).status,404)});
  await check('stored answer key unchanged',async()=>assert.deepEqual((await db.userGeneration.findUnique({where:{id:'gen'}})).outputData,output));
}

async function lmsTest(){
  for(const id of ['student-A','student-B','teacher'])await db.user.create({data:{id,email:id+'@example.invalid',passwordHash:'synthetic-not-login',role:id==='teacher'?'admin':'student'}});
  await db.course.create({data:{id:'course',slug:'synthetic-access',title:'Synthetic',authorId:'teacher'}});
  await db.module.create({data:{id:'module',courseId:'course',title:'Test',orderIndex:0,allowedTariffs:[],allowedTracks:[],allowedGroups:[]}});
  for(const id of ['quiz','other'])await db.lesson.create({data:{id,moduleId:'module',title:id,type:'quiz',orderIndex:0,quizPassingScore:70,content:{questions:[{id:'q',type:'single_choice',correctAnswer:'yes',points:1}]}}});
  const tokens={};
  for(const id of ['student-A','student-B']){
    await db.userSession.create({data:{userId:id,sessionId:'session-'+id,isActive:true}});
    tokens[id]=jwt.sign({userId:id,email:id+'@example.invalid',role:'student',sessionId:'session-'+id},secret,{expiresIn:'10m'});
  }
  const attempt=id=>db.quizAttempt.create({data:{id,userId:'student-A',lessonId:'quiz',attemptNumber:1,answers:{}}});
  const submit=(who,id,lesson='quiz',answer='yes')=>fetch('http://security-web:3000/api/lessons/'+lesson+'/quiz',{method:'PATCH',headers:{'Content-Type':'application/json',...(who?{Cookie:'accessToken='+tokens[who]}:{})},body:JSON.stringify({attemptId:id,userId:'student-A',answers:{q:answer}}),signal:AbortSignal.timeout(20000)});
  await attempt('first');
  await check('real Next unauthenticated -> 401',async()=>assert.equal((await submit(null,'first')).status,401));
  await check('real Next foreign owner with forged body userId -> 404',async()=>assert.equal((await submit('student-B','first')).status,404));
  await check('real Next wrong lesson -> 404',async()=>assert.equal((await submit('student-A','first','other')).status,404));
  await check('rejected requests do not write attempt',async()=>{const a=await db.quizAttempt.findUnique({where:{id:'first'}});assert.equal(a.submittedAt,null);assert.deepEqual(a.answers,{})});
  await check('owner scores 100; only own progress updated',async()=>{const r=await submit('student-A','first');assert.equal(r.status,200);assert.equal((await r.json()).data.score,100);assert.equal(await db.lessonProgress.count({where:{userId:'student-B'}}),0)});
  await check('replay rejected without changing result',async()=>{assert.equal((await submit('student-A','first','quiz','no')).status,400);assert.equal((await db.quizAttempt.findUnique({where:{id:'first'}})).score,100)});
  await attempt('race');
  await check('10 concurrent HTTP submissions: exactly one success',async()=>{const r=await Promise.all(Array.from({length:10},(_,i)=>submit('student-A','race','quiz',i%2?'yes':'no')));assert.equal(r.filter(x=>x.status===200).length,1);assert.equal(r.filter(x=>x.status===400).length,9)});
  await attempt('rollback');
  await check('DB failure rolls back attempt transaction',async()=>{
    await db.$executeRawUnsafe("CREATE FUNCTION fail_progress() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic_failure'; END $$");
    await db.$executeRawUnsafe('CREATE TRIGGER fail_progress BEFORE INSERT OR UPDATE ON lesson_progress FOR EACH ROW EXECUTE FUNCTION fail_progress()');
    try{assert.equal((await submit('student-A','rollback')).status,500)}finally{await db.$executeRawUnsafe('DROP TRIGGER fail_progress ON lesson_progress');await db.$executeRawUnsafe('DROP FUNCTION fail_progress()')}
    assert.equal((await db.quizAttempt.findUnique({where:{id:'rollback'}})).submittedAt,null);
  });
}

(async()=>{try{await (process.argv[2]==='prep'?prepTest():lmsTest());console.log(JSON.stringify({result:'PASS',project:process.argv[2],checks:passed,node:process.version,platform:process.platform,productionTouched:false}))}finally{await app?.close();await db.$disconnect()}})().catch(e=>{console.error(e);process.exitCode=1});
